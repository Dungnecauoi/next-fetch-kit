import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCookieHeader, isServer } from '../src/cookies';

describe('cookies', () => {
  describe('isServer()', () => {
    it('returns true in Node.js environment', () => {
      expect(isServer()).toBe(true);
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

    it('serializes CookieStore from per-request option', async () => {
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

    it('per-request cookies override forwardCookies', async () => {
      const result = await resolveCookieHeader(
        { forwardCookies: true },
        { cookies: 'override=true' },
      );
      // Should use per-request, not global
      expect(result).toBe('override=true');
    });

    it('returns undefined when no cookies configured', async () => {
      const result = await resolveCookieHeader({}, {});
      expect(result).toBeUndefined();
    });

    it('forwardCookies: true in SSR gracefully handles missing next/headers', async () => {
      // In test environment, next/headers is not available
      // Should return undefined without throwing
      const result = await resolveCookieHeader(
        { forwardCookies: true },
        {},
      );
      // Should gracefully return undefined since next/headers is not installed
      expect(result).toBeUndefined();
    });

    it('handles empty CookieStore', async () => {
      const emptyCookieStore = {
        getAll: () => [],
      };

      const result = await resolveCookieHeader(
        {},
        { cookies: emptyCookieStore },
      );
      expect(result).toBe('');
    });

    it('forwardCookies: true successfully reads cookies from next/headers when present', async () => {
      // Mock Function constructor or import mechanism for next/headers
      const originalFunction = globalThis.Function;
      const mockCookies = () => Promise.resolve({
        getAll: () => [
          { name: 'auth_token', value: 'secret123' },
          { name: 'theme', value: 'dark' },
        ],
      });

      // Override Function to simulate dynamic import('next/headers')
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
  });
});
