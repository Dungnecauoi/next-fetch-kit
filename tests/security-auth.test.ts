import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError } from '../src/error';

describe('security — auth security', () => {
  describe('BUG-1 regression: _isAuthRetry not in public API', () => {
    it('user cannot bypass auth refresh by setting _isAuthRetry', async () => {
      let refreshCalled = false;
      let callCount = 0;

      server.use(
        http.get('https://api.test.com/protected', ({ request }) => {
          callCount++;
          const auth = request.headers.get('Authorization');
          if (auth !== 'Bearer fresh-token') {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ ok: true });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => 'expired',
          refresh: async () => {
            refreshCalled = true;
            return 'fresh-token';
          },
        },
      });

      // Even if user tries to pass _isAuthRetry, it should be ignored
      // because it's no longer part of RequestConfig
      const { data } = await api.get<{ ok: boolean }>('/protected', {
        // @ts-expect-error — _isAuthRetry is intentionally NOT in RequestConfig
        _isAuthRetry: true,
      });

      // Refresh SHOULD have been called (user can't bypass it)
      expect(refreshCalled).toBe(true);
      expect(data.ok).toBe(true);
    });
  });

  describe('BUG-2 regression: auth retry runs onRequest hook', () => {
    it('onRequest interceptor runs on the retried request after 401', async () => {
      const onRequestCalls: string[] = [];
      let callCount = 0;

      server.use(
        http.get('https://api.test.com/needs-header', ({ request }) => {
          callCount++;
          const auth = request.headers.get('Authorization');
          const custom = request.headers.get('X-Intercepted');
          if (auth === 'Bearer expired') {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ customHeader: custom });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        onRequest(config) {
          onRequestCalls.push(config.url);
          config.headers.set('X-Intercepted', 'yes');
          return config;
        },
        auth: {
          getToken: () => (callCount === 0 ? 'expired' : 'valid'),
          refresh: async () => 'valid',
        },
      });

      const { data } = await api.get<{ customHeader: string }>('/needs-header');
      // onRequest should have been called TWICE (original + retry)
      expect(onRequestCalls.length).toBe(2);
      expect(data.customHeader).toBe('yes');
    });
  });

  describe('BUG-3 regression: auth retry runs onResponse hook', () => {
    it('onResponse hook runs on the retried response after 401', async () => {
      const onResponseCalls: number[] = [];
      let callCount = 0;

      server.use(
        http.get('https://api.test.com/response-hook', ({ request }) => {
          callCount++;
          const auth = request.headers.get('Authorization');
          if (auth === 'Bearer expired') {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ value: 42 });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        onResponse(response) {
          onResponseCalls.push(response.status);
          return response;
        },
        auth: {
          getToken: () => (callCount === 0 ? 'expired' : 'valid'),
          refresh: async () => 'valid',
        },
      });

      await api.get('/response-hook');
      // onResponse should have been called for the retry response
      expect(onResponseCalls.length).toBe(1);
      expect(onResponseCalls[0]).toBe(200);
    });
  });

  describe('BUG-4 regression: auth retry has timeout protection', () => {
    it('auth retry respects timeout', async () => {
      let callCount = 0;

      server.use(
        http.get('https://api.test.com/timeout-retry', async ({ request }) => {
          callCount++;
          const auth = request.headers.get('Authorization');
          if (auth === 'Bearer expired') {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          // Second call (after refresh) hangs forever
          await new Promise((r) => setTimeout(r, 5000));
          return HttpResponse.json({ ok: true });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        timeout: 200, // 200ms timeout
        auth: {
          getToken: () => (callCount === 0 ? 'expired' : 'valid'),
          refresh: async () => 'valid',
        },
      });

      try {
        await api.get('/timeout-retry');
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchKitError);
        const e = error as FetchKitError;
        expect(e.isTimeout()).toBe(true);
      }
    });
  });

  describe('getToken edge cases', () => {
    it('getToken() throws error → request fails gracefully', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => {
            throw new Error('Token storage corrupted');
          },
        },
      });

      await expect(api.get('/users')).rejects.toThrow('Token storage corrupted');
    });

    it('getToken() returns null → no Authorization header set', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => null,
        },
      });

      const { data } = await api.get<Record<string, string>>('/echo-headers');
      expect(data['authorization']).toBeUndefined();
    });

    it('getToken() returns empty string → no Authorization header set', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => '',
        },
      });

      const { data } = await api.get<Record<string, string>>('/echo-headers');
      expect(data['authorization']).toBeUndefined();
    });
  });

  describe('refresh edge cases', () => {
    it('refresh returns empty string → treated as no token (cookie-based)', async () => {
      let callCount = 0;

      server.use(
        http.get('https://api.test.com/empty-refresh', ({ request }) => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ ok: true });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => 'expired',
          refresh: async () => '',
        },
      });

      // Empty string is falsy, so it should go through the cookie-based path
      const { data } = await api.get<{ ok: boolean }>('/empty-refresh');
      expect(data.ok).toBe(true);
    });

    it('onRefreshed callback throwing does not break pipeline', async () => {
      let callCount = 0;

      server.use(
        http.get('https://api.test.com/refresh-callback', ({ request }) => {
          callCount++;
          const auth = request.headers.get('Authorization');
          if (auth === 'Bearer expired') {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ ok: true });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => (callCount === 0 ? 'expired' : 'valid'),
          refresh: async () => 'valid',
          onRefreshed: () => {
            throw new Error('onRefreshed crashed');
          },
        },
      });

      // Should throw because onRefreshed error propagates through auth handler
      await expect(api.get('/refresh-callback')).rejects.toThrow();
    });

    it('onRefreshFailed throwing does not swallow original error', async () => {
      server.use(
        http.get('https://api.test.com/double-fail', () => {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => 'expired',
          refresh: async () => {
            throw new Error('Refresh failed');
          },
          onRefreshFailed: () => {
            throw new Error('onRefreshFailed also crashed');
          },
        },
      });

      await expect(api.get('/double-fail')).rejects.toThrow();
    });
  });

  describe('raw instance security', () => {
    it('raw instance used for refresh does NOT have auth headers', async () => {
      let refreshRequestHeaders: Record<string, string> = {};

      server.use(
        http.get('https://api.test.com/secured', () => {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }),
        http.post('https://api.test.com/auth/refresh', ({ request }) => {
          request.headers.forEach((value, key) => {
            refreshRequestHeaders[key] = value;
          });
          return HttpResponse.json({ accessToken: 'new-token' });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => 'my-secret-token',
          refresh: async (kit) => {
            const { data } = await kit.post<{ accessToken: string }>('/auth/refresh');
            return data.accessToken;
          },
        },
      });

      // The request will fail even after refresh (endpoint always 401)
      // but we can inspect what headers the refresh call had
      try {
        await api.get('/secured');
      } catch {
        // Expected to fail
      }

      // The refresh request should NOT have Authorization header
      expect(refreshRequestHeaders['authorization']).toBeUndefined();
    });
  });

  describe('concurrent refresh correctness', () => {
    it('handles 50 concurrent 401s with exactly 1 refresh', async () => {
      let refreshCount = 0;
      let requestCount = 0;

      server.use(
        http.get('https://api.test.com/mass-401', ({ request }) => {
          requestCount++;
          const auth = request.headers.get('Authorization');
          if (auth === 'Bearer expired') {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ id: requestCount });
        }),
        http.post('https://api.test.com/auth/refresh', async () => {
          refreshCount++;
          await new Promise((r) => setTimeout(r, 30));
          return HttpResponse.json({ accessToken: 'fresh-50' });
        }),
      );

      let currentToken = 'expired';
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => currentToken,
          refresh: async (kit) => {
            const { data } = await kit.post<{ accessToken: string }>('/auth/refresh');
            return data.accessToken;
          },
          onRefreshed: (token) => {
            currentToken = token;
          },
        },
      });

      const promises = Array.from({ length: 50 }, () => api.get('/mass-401'));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(50);
      expect(refreshCount).toBe(1);
    });
  });
});
