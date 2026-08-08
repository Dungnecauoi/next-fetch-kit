import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { createAuthManager } from '../src/auth';
import { FetchKitError } from '../src/error';

describe('auth — auto refresh token', () => {
  describe('header-based auth (Authorization header)', () => {
    it('attaches token via getToken()', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => 'valid-token',
        },
      });

      const { data } = await api.get<{ token: string }>('/me');
      expect(data.token).toBe('Bearer valid-token');
    });

    it('auto refreshes on 401 and retries', async () => {
      let tokenValue = 'expired';
      const onRefreshed = vi.fn((newToken?: string | void) => {
        if (newToken) tokenValue = newToken;
      });

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => tokenValue,
          refresh: async (kit) => {
            const { data } = await kit.post<{ accessToken: string }>('/auth/refresh');
            return data.accessToken;
          },
          onRefreshed,
        },
      });

      const { data } = await api.get<{ name: string }>('/me');
      expect(data.name).toBe('Authenticated User');
      expect(onRefreshed).toHaveBeenCalledWith('new-token-123');
      expect(tokenValue).toBe('new-token-123');
    });

    it('calls onRefreshFailed when refresh fails', async () => {
      const onRefreshFailed = vi.fn();

      server.use(
        http.post('https://api.test.com/auth/refresh', () => {
          return HttpResponse.json({ message: 'Refresh token expired' }, { status: 401 });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => 'expired',
          refresh: async (kit) => {
            const { data } = await kit.post<{ accessToken: string }>('/auth/refresh');
            return data.accessToken;
          },
          onRefreshFailed,
        },
      });

      await expect(api.get('/me')).rejects.toThrow();
      expect(onRefreshFailed).toHaveBeenCalled();
    });

    it('does not call applyToken when getToken returns null', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => null,
          refresh: async () => 'refreshed',
        },
      });

      // GET /config does not require auth — should succeed with no auth header
      const { data } = await api.get<{ theme: string }>('/config');
      expect(data.theme).toBe('dark');
    });

    it('does not call applyToken when getToken returns undefined', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => undefined,
        },
      });

      const { data } = await api.get<{ theme: string }>('/config');
      expect(data).toBeDefined();
    });
  });

  describe('cookie-based auth', () => {
    it('refreshes without returning token (cookie-based) and onRefreshed is called', async () => {
      let callCount = 0;
      const onRefreshed = vi.fn();

      server.use(
        http.get('https://api.test.com/cookie-me', () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ name: 'Cookie User' });
        }),
        http.post('https://api.test.com/auth/refresh', () => {
          return HttpResponse.json({ ok: true });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        credentials: 'include',
        auth: {
          refresh: async (kit) => {
            await kit.post('/auth/refresh');
            // No return — cookie-based
          },
          onRefreshed, // Must be called even for void/cookie-based refresh
        },
      });

      const { data } = await api.get<{ name: string }>('/cookie-me');
      expect(data.name).toBe('Cookie User');
      expect(callCount).toBe(2);
      // onRefreshed should fire even when refresh returns void (cookie-based)
      expect(onRefreshed).toHaveBeenCalledOnce();
      expect(onRefreshed).toHaveBeenCalledWith(undefined);
    });
  });

  describe('queue mechanism (race condition)', () => {
    it('queues multiple 401 requests and refreshes only once', async () => {
      let refreshCount = 0;
      let requestCount = 0;

      server.use(
        http.get('https://api.test.com/queue-test', ({ request }) => {
          requestCount++;
          const auth = request.headers.get('Authorization');
          if (auth === 'Bearer expired') {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ id: requestCount });
        }),
        http.post('https://api.test.com/auth/refresh', async () => {
          refreshCount++;
          await new Promise((r) => setTimeout(r, 50));
          return HttpResponse.json({ accessToken: 'fresh-token' });
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
          onRefreshed: (newToken) => {
            if (newToken) currentToken = newToken;
          },
        },
      });

      const results = await Promise.all([
        api.get('/queue-test'),
        api.get('/queue-test'),
        api.get('/queue-test'),
      ]);

      expect(results).toHaveLength(3);
      expect(refreshCount).toBe(1);
    });
  });

  describe('no auth config', () => {
    it('throws 401 error when no auth configured', async () => {
      const api = createFetchKit({ baseURL: 'https://api.test.com' });

      try {
        await api.get('/error/401');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchKitError);
        expect((error as FetchKitError).status).toBe(401);
      }
    });
  });

  describe('async getToken', () => {
    it('supports async getToken()', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return 'async-token';
          },
        },
      });

      const { data } = await api.get<{ token: string }>('/me');
      expect(data.token).toBe('Bearer async-token');
    });
  });

  describe('edge cases & infinite loop protection', () => {
    it('prevents infinite 401 loop when retried request STILL receives 401', async () => {
      let refreshAttempts = 0;

      server.use(
        http.get('https://api.test.com/banned-user', () => {
          return HttpResponse.json({ message: 'User banned' }, { status: 401 });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => 'token-1',
          refresh: async () => {
            refreshAttempts++;
            return 'token-2';
          },
        },
      });

      await expect(api.get('/banned-user')).rejects.toThrow();
      expect(refreshAttempts).toBe(1);
    });

    it('handles heavy load: 10 concurrent 401 requests with 1 refresh call', async () => {
      let refreshAttempts = 0;

      server.use(
        http.get('https://api.test.com/heavy-load', ({ request }) => {
          const auth = request.headers.get('Authorization');
          if (auth !== 'Bearer fresh-token-10') {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ ok: true });
        }),
      );

      let currentToken = 'old-token';
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => currentToken,
          refresh: async () => {
            refreshAttempts++;
            await new Promise((r) => setTimeout(r, 20));
            currentToken = 'fresh-token-10';
            return currentToken;
          },
        },
      });

      const promises = Array.from({ length: 10 }, () => api.get('/heavy-load'));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(refreshAttempts).toBe(1);
    });

    it('rejects all queued requests when refresh throws an error', async () => {
      server.use(
        http.get('https://api.test.com/fail-queue', () => {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => 'old',
          refresh: async () => {
            throw new Error('Refresh server crashed');
          },
        },
      });

      const promises = [
        api.get('/fail-queue'),
        api.get('/fail-queue'),
        api.get('/fail-queue'),
      ];

      await expect(Promise.all(promises)).rejects.toThrow('Refresh server crashed');
    });
  });

  describe('createAuthManager() unit tests', () => {
    it('hasRefresh() returns true when refresh is configured', () => {
      const manager = createAuthManager({
        refresh: async () => 'token',
      });
      expect(manager.hasRefresh()).toBe(true);
    });

    it('hasRefresh() returns false when refresh is NOT configured', () => {
      const manager = createAuthManager({
        getToken: () => 'some-token',
      });
      expect(manager.hasRefresh()).toBe(false);
    });

    it('reset() clears internal state', () => {
      const manager = createAuthManager({
        refresh: async () => 'token',
      });
      // Reset should not throw and should be idempotent
      manager.reset();
      manager.reset();
      expect(manager.hasRefresh()).toBe(true);
    });

    it('applyToken() does nothing when getToken is not configured', async () => {
      const manager = createAuthManager({
        refresh: async () => 'token',
      });
      const headers = new Headers();
      await manager.applyToken(headers);
      expect(headers.has('Authorization')).toBe(false);
    });

    it('applyToken() does nothing when getToken returns null', async () => {
      const manager = createAuthManager({
        getToken: () => null,
      });
      const headers = new Headers();
      await manager.applyToken(headers);
      expect(headers.has('Authorization')).toBe(false);
    });

    it('applyToken() sets Authorization header when getToken returns a token', async () => {
      const manager = createAuthManager({
        getToken: () => 'my-secret-token',
      });
      const headers = new Headers();
      await manager.applyToken(headers);
      expect(headers.get('Authorization')).toBe('Bearer my-secret-token');
    });

    it('handleUnauthorized() rejects when no refresh handler is configured', async () => {
      const manager = createAuthManager({
        getToken: () => 'token',
      });
      const rawInstance = createFetchKit({ baseURL: 'https://api.test.com' });

      await expect(manager.handleUnauthorized(rawInstance)).rejects.toThrow(
        'Unauthorized (401)',
      );
    });

    it('second call while refreshing is queued and resolves with same result', async () => {
      let refreshCallCount = 0;

      server.use(
        http.post('https://api.test.com/auth/refresh', async () => {
          refreshCallCount++;
          await new Promise((r) => setTimeout(r, 30));
          return HttpResponse.json({ accessToken: 'new-token' });
        }),
      );

      let tokenValue = 'old';
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        auth: {
          getToken: () => tokenValue,
          refresh: async (kit) => {
            const { data } = await kit.post<{ accessToken: string }>('/auth/refresh');
            tokenValue = data.accessToken;
            return data.accessToken;
          },
        },
      });

      server.use(
        http.get('https://api.test.com/guarded', ({ request }) => {
          const auth = request.headers.get('Authorization');
          if (!auth || auth === 'Bearer old') {
            return HttpResponse.json({ msg: 'unauth' }, { status: 401 });
          }
          return HttpResponse.json({ ok: true });
        }),
      );

      const [r1, r2] = await Promise.all([
        api.get('/guarded'),
        api.get('/guarded'),
      ]);

      expect((r1.data as any).ok).toBe(true);
      expect((r2.data as any).ok).toBe(true);
      expect(refreshCallCount).toBe(1);
    });
  });
});
