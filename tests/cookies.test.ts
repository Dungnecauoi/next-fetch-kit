import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCookieHeader, isServer, getNextServerOrigin } from '../src/cookies';

describe('cookies', () => {
  describe('isServer()', () => {
    it('returns true in Node.js environment (no window)', () => {
      expect(isServer()).toBe(true);
    });

    it('returns false when window is defined (simulated browser)', () => {
      (globalThis as any).window = {};
      expect(isServer()).toBe(false);
      delete (globalThis as any).window;
    });
  });

  describe('resolveCookieHeader()', () => {
    it('returns string cookies directly from per-request option', async () => {
      const result = await resolveCookieHeader(
        {},
        { cookies: 'session=abc; token=xyz' },
      );
      expect(result).toBe('session=abc; token=xyz');
    });

    it('serializes CookieStore with getAll() from per-request option', async () => {
      const mockCookieStore = {
        getAll: () => [
          { name: 'session', value: 'abc123' },
          { name: 'csrf', value: 'def456' },
        ],
      };

      const result = await resolveCookieHeader(
        {},
        { cookies: mockCookieStore },
      );
      expect(result).toBe('session=abc123; csrf=def456');
    });

    it('uses toString() fallback when getAll() is not present', async () => {
      const cookieWithToString = {
        toString: () => 'fallback=cookie',
      };

      const result = await resolveCookieHeader(
        {},
        { cookies: cookieWithToString as any },
      );
      expect(result).toBe('fallback=cookie');
    });

    it('per-request cookies override forwardCookies', async () => {
      const result = await resolveCookieHeader(
        { forwardCookies: true },
        { cookies: 'override=true' },
      );
      expect(result).toBe('override=true');
    });

    it('returns undefined when no cookies configured', async () => {
      const result = await resolveCookieHeader({}, {});
      expect(result).toBeUndefined();
    });

    it('forwardCookies: true in SSR gracefully handles missing next/headers', async () => {
      const result = await resolveCookieHeader(
        { forwardCookies: true },
        {},
      );
      expect(result).toBeUndefined();
    });

    it('handles empty CookieStore (returns empty string)', async () => {
      const emptyCookieStore = { getAll: () => [] };

      const result = await resolveCookieHeader(
        {},
        { cookies: emptyCookieStore },
      );
      expect(result).toBe('');
    });

    it('ignores forwardCookies when not on server (CSR)', async () => {
      (globalThis as any).window = {};
      try {
        const result = await resolveCookieHeader({ forwardCookies: true }, {});
        // In browser env, forwardCookies is skipped → undefined
        expect(result).toBeUndefined();
      } finally {
        delete (globalThis as any).window;
      }
    });

    it('forwardCookies: true reads cookies from mocked next/headers', async () => {
      const originalFunction = globalThis.Function;
      const mockCookies = () => Promise.resolve({
        getAll: () => [
          { name: 'auth_token', value: 'secret123' },
          { name: 'theme', value: 'dark' },
        ],
      });

      // @ts-expect-error mocking Function
      globalThis.Function = function (...args: string[]) {
        if (args.includes('return import("next/headers")')) {
          return () => Promise.resolve({ cookies: mockCookies });
        }
        return originalFunction(...args);
      };

      try {
        const result = await resolveCookieHeader({ forwardCookies: true }, {});
        expect(result).toBe('auth_token=secret123; theme=dark');
      } finally {
        globalThis.Function = originalFunction;
      }
    });

    it('handles single-cookie CookieStore', async () => {
      const store = { getAll: () => [{ name: 'token', value: 'abc' }] };
      const result = await resolveCookieHeader({}, { cookies: store });
      expect(result).toBe('token=abc');
    });
  });

  describe('getNextServerOrigin()', () => {
    it('returns localhost fallback when next/headers is unavailable', async () => {
      const origin = await getNextServerOrigin();
      // In test env, next/headers not available → fallback to localhost:3000
      expect(origin).toMatch(/^http:\/\/localhost:\d+$/);
    });

    it('uses PORT env var for fallback origin', async () => {
      const proc = (globalThis as any).process;
      const originalPort = proc?.env?.PORT;
      if (proc?.env) proc.env.PORT = '4321';

      try {
        const origin = await getNextServerOrigin();
        expect(origin).toContain('4321');
      } finally {
        if (proc?.env) {
          if (originalPort !== undefined) proc.env.PORT = originalPort;
          else delete proc.env.PORT;
        }
      }
    });

    it('reads host from mocked next/headers headers()', async () => {
      const originalFunction = globalThis.Function;

      // @ts-expect-error mocking Function
      globalThis.Function = function (...args: string[]) {
        if (args.includes('return import("next/headers")')) {
          return () => Promise.resolve({
            headers: () => Promise.resolve({
              get: (key: string) => {
                if (key === 'host') return 'example.com:8080';
                if (key === 'x-forwarded-proto') return 'https';
                return null;
              },
            }),
          });
        }
        return originalFunction(...args);
      };

      try {
        const origin = await getNextServerOrigin();
        expect(origin).toBe('https://example.com:8080');
      } finally {
        globalThis.Function = originalFunction;
      }
    });

    it('falls back to http when x-forwarded-proto is missing', async () => {
      const originalFunction = globalThis.Function;

      // @ts-expect-error mocking Function
      globalThis.Function = function (...args: string[]) {
        if (args.includes('return import("next/headers")')) {
          return () => Promise.resolve({
            headers: () => Promise.resolve({
              get: (key: string) => {
                if (key === 'host') return 'myapp.dev';
                return null; // no x-forwarded-proto
              },
            }),
          });
        }
        return originalFunction(...args);
      };

      try {
        const origin = await getNextServerOrigin();
        expect(origin).toBe('http://myapp.dev');
      } finally {
        globalThis.Function = originalFunction;
      }
    });

    it('falls back to localhost when host header is null', async () => {
      const originalFunction = globalThis.Function;

      // @ts-expect-error mocking Function
      globalThis.Function = function (...args: string[]) {
        if (args.includes('return import("next/headers")')) {
          return () => Promise.resolve({
            headers: () => Promise.resolve({
              get: () => null, // no host
            }),
          });
        }
        return originalFunction(...args);
      };

      try {
        const origin = await getNextServerOrigin();
        expect(origin).toMatch(/^http:\/\/localhost:\d+$/);
      } finally {
        globalThis.Function = originalFunction;
      }
    });
  });
});
