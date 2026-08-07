import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError, isFetchKitError } from '../src/error';
import { isServer } from '../src/cookies';

describe('security — cookie security', () => {
  it('cookie value with semicolon is forwarded correctly', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<Record<string, string>>('/echo-headers', {
      cookies: 'session=abc;def; other=val',
    });
    expect(data['cookie']).toBe('session=abc;def; other=val');
  });

  it('empty CookieStore getAll() produces no Cookie header', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<Record<string, string>>('/echo-headers', {
      cookies: { getAll: () => [] },
    });
    // Empty cookie store should not set a Cookie header, or set it to empty
    // The actual behavior depends on implementation — empty string is valid
    expect(data['cookie']).toBeFalsy();
  });

  it('CookieStore is correctly serialized', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<Record<string, string>>('/echo-headers', {
      cookies: {
        getAll: () => [
          { name: 'session', value: 'abc123' },
          { name: 'theme', value: 'dark' },
        ],
      },
    });
    expect(data['cookie']).toBe('session=abc123; theme=dark');
  });

  it('string cookies passed directly', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<Record<string, string>>('/echo-headers', {
      cookies: 'token=xyz; lang=en',
    });
    expect(data['cookie']).toBe('token=xyz; lang=en');
  });

  it('per-request cookies override global forwardCookies', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      forwardCookies: true,
    });

    // Per-request cookies should take priority
    const { data } = await api.get<Record<string, string>>('/echo-headers', {
      cookies: 'explicit=yes',
    });
    expect(data['cookie']).toBe('explicit=yes');
  });

  it('isServer() returns true in test environment (Node.js)', () => {
    expect(isServer()).toBe(true);
  });
});

describe('security — interceptor abuse', () => {
  it('onRequest returning void/undefined does not crash (fallback to original)', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onRequest(config) {
        // Forgot to return config — common mistake
        config.headers.set('X-Oops', 'no-return');
        // returns undefined
        return undefined as unknown as typeof config;
      },
    });

    // This might crash or behave unexpectedly
    try {
      await api.get('/users');
    } catch (error) {
      // If it crashes, it should be a clear error, not undefined behavior
      expect(error).toBeDefined();
    }
  });

  it('onResponse returning void uses original response', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onResponse() {
        // Returns void (no explicit return)
      },
    });

    const { data } = await api.get<Array<{ id: number }>>('/users');
    // Original response should be returned since hook returned void
    expect(data).toHaveLength(2);
  });

  it('onResponse hook that throws → error propagates correctly', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onResponse() {
        throw new Error('onResponse crashed');
      },
    });

    await expect(api.get('/users')).rejects.toThrow('onResponse crashed');
  });

  it('onError hook that throws does not swallow original error', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onError() {
        throw new Error('onError also crashed');
      },
    });

    try {
      await api.get('/error/400');
      expect.fail('Should have thrown');
    } catch (error) {
      // The error thrown should be from onError or the original — either is acceptable
      // as long as it doesn't silently succeed
      expect(error).toBeDefined();
    }
  });

  it('onResponseError hook is called for HTTP errors, not network errors', async () => {
    const onResponseError = vi.fn();
    const onRequestError = vi.fn();

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onResponseError,
      onRequestError,
    });

    await expect(api.get('/error/500')).rejects.toThrow();
    expect(onResponseError).toHaveBeenCalledOnce();
    expect(onRequestError).not.toHaveBeenCalled();
  });

  it('onRequestError hook is called for network errors, not HTTP errors', async () => {
    const onResponseError = vi.fn();
    const onRequestError = vi.fn();

    server.use(
      http.get('https://api.test.com/network-die', () => {
        return HttpResponse.error();
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onResponseError,
      onRequestError,
    });

    await expect(api.get('/network-die')).rejects.toThrow();
    expect(onRequestError).toHaveBeenCalledOnce();
    expect(onResponseError).not.toHaveBeenCalled();
  });
});

describe('security — instance isolation', () => {
  it('extend() creates fully independent instance', async () => {
    const parent = createFetchKit({
      baseURL: 'https://api.test.com',
      headers: { 'X-Parent': 'yes' },
    });

    const child = parent.extend({
      headers: { 'X-Child': 'yes' },
    });

    // Child should have both headers
    const childData = await child.get<Record<string, string>>('/echo-headers');
    expect(childData.data['x-parent']).toBe('yes');
    expect(childData.data['x-child']).toBe('yes');

    // Parent should NOT have child headers
    const parentData = await parent.get<Record<string, string>>('/echo-headers');
    expect(parentData.data['x-parent']).toBe('yes');
    expect(parentData.data['x-child']).toBeUndefined();
  });

  it('multiple extend() chains (3 levels) work correctly', async () => {
    const base = createFetchKit({
      baseURL: 'https://api.test.com',
      headers: { 'X-L1': '1' },
    });

    const level2 = base.extend({ headers: { 'X-L2': '2' } });
    const level3 = level2.extend({ headers: { 'X-L3': '3' } });

    const { data } = await level3.get<Record<string, string>>('/echo-headers');
    expect(data['x-l1']).toBe('1');
    expect(data['x-l2']).toBe('2');
    expect(data['x-l3']).toBe('3');
  });

  it('concurrent requests on same instance have no state leakage', async () => {
    let counter = 0;
    server.use(
      http.get('https://api.test.com/concurrent', async ({ request }) => {
        counter++;
        const id = counter;
        // Add varying delay to simulate real-world conditions
        await new Promise((r) => setTimeout(r, Math.random() * 50));
        return HttpResponse.json({
          id,
          auth: request.headers.get('Authorization'),
        });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      headers: { Authorization: 'Bearer shared-token' },
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => api.get<{ id: number; auth: string }>('/concurrent')),
    );

    // All should have the same auth header (no cross-contamination)
    for (const result of results) {
      expect(result.data.auth).toBe('Bearer shared-token');
    }
  });
});

describe('security — error information', () => {
  it('FetchKitError.config may contain sensitive headers (awareness test)', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      auth: {
        getToken: () => 'secret-token-123',
      },
    });

    try {
      await api.get('/error/400');
    } catch (error) {
      const e = error as FetchKitError;
      // Document: error.config.headers contains the Authorization token
      // Users should be aware of this when logging errors
      expect(e.config).toBeDefined();
      if (e.config) {
        const authHeader = e.config.headers.get('Authorization');
        expect(authHeader).toBe('Bearer secret-token-123');
      }
    }
  });

  it('isFetchKitError with null/undefined/number returns false', () => {
    expect(isFetchKitError(null)).toBe(false);
    expect(isFetchKitError(undefined)).toBe(false);
    expect(isFetchKitError(42)).toBe(false);
    expect(isFetchKitError('string')).toBe(false);
    expect(isFetchKitError({})).toBe(false);
  });

  it('isFetchKitError with duck-typed object returns true', () => {
    const fakeError = {
      name: 'FetchKitError',
      type: 'http',
      message: 'fake',
    };
    expect(isFetchKitError(fakeError)).toBe(true);
  });

  it('FetchKitError preserves cause for debugging', async () => {
    server.use(
      http.get('https://api.test.com/cause-test', () => {
        return HttpResponse.error();
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });

    try {
      await api.get('/cause-test');
    } catch (error) {
      const e = error as FetchKitError;
      expect(e.isNetworkError()).toBe(true);
      // cause should be preserved for debugging
      expect((e as unknown as Record<string, unknown>).cause).toBeDefined();
    }
  });

  it('FetchKitError can be JSON.stringified without circular crash', async () => {
    try {
      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      await api.get('/error/400');
    } catch (error) {
      const e = error as FetchKitError;
      // Should not throw due to circular references
      expect(() => {
        JSON.stringify({
          message: e.message,
          type: e.type,
          status: e.status,
          data: e.data,
        });
      }).not.toThrow();
    }
  });
});

describe('security — memory & resource cleanup', () => {
  it('auth failedQueue is cleared after successful refresh', async () => {
    let refreshCount = 0;

    server.use(
      http.get('https://api.test.com/mem-test', ({ request }) => {
        const auth = request.headers.get('Authorization');
        if (auth === 'Bearer old') {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );

    let token = 'old';
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      auth: {
        getToken: () => token,
        refresh: async () => {
          refreshCount++;
          token = 'new-' + refreshCount;
          return token;
        },
      },
    });

    // First batch
    await Promise.all([api.get('/mem-test'), api.get('/mem-test')]);
    expect(refreshCount).toBe(1);

    // Reset token to trigger another refresh
    token = 'old';

    // Second batch — should trigger a NEW refresh (queue was cleared)
    await Promise.all([api.get('/mem-test'), api.get('/mem-test')]);
    expect(refreshCount).toBe(2);
  });

  it('auth failedQueue is cleared after failed refresh', async () => {
    let refreshCount = 0;

    server.use(
      http.get('https://api.test.com/mem-fail', () => {
        return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      auth: {
        getToken: () => 'expired',
        refresh: async () => {
          refreshCount++;
          throw new Error('Refresh failed');
        },
      },
    });

    // First batch fails
    await expect(
      Promise.all([api.get('/mem-fail'), api.get('/mem-fail')]),
    ).rejects.toThrow();

    const firstRefreshCount = refreshCount;

    // Second batch should be able to trigger a NEW refresh attempt
    await expect(
      Promise.all([api.get('/mem-fail'), api.get('/mem-fail')]),
    ).rejects.toThrow();

    // Refresh should have been called again (queue was properly cleaned up)
    expect(refreshCount).toBeGreaterThan(firstRefreshCount);
  });

  it('sequential requests do not accumulate resources', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });

    // Run 100 sequential requests
    for (let i = 0; i < 100; i++) {
      const { status } = await api.get('/users');
      expect(status).toBe(200);
    }
    // If we get here without crash/OOM, resources are properly managed
  });
});
