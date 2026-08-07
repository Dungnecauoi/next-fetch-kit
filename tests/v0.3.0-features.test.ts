import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError } from '../src/error';

describe('v0.3.0 features — Custom Fetch, Query Alias, Hook Chaining & Retry Enhancements', () => {
  describe('Feature 1: Custom fetch implementation', () => {
    it('uses custom fetch implementation passed in instance config', async () => {
      const customFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        return new Response(JSON.stringify({ custom: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        fetch: customFetch as unknown as typeof fetch,
      });

      const { data } = await api.get<{ custom: boolean }>('/users');
      expect(data.custom).toBe(true);
      expect(customFetch).toHaveBeenCalledOnce();
    });

    it('per-request fetch overrides instance fetch', async () => {
      const instanceFetch = vi.fn();
      const requestFetch = vi.fn(async () => {
        return new Response(JSON.stringify({ requestLevel: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        fetch: instanceFetch as unknown as typeof fetch,
      });

      const { data } = await api.get<{ requestLevel: boolean }>('/users', {
        fetch: requestFetch as unknown as typeof fetch,
      });

      expect(data.requestLevel).toBe(true);
      expect(requestFetch).toHaveBeenCalledOnce();
      expect(instanceFetch).not.toHaveBeenCalled();
    });
  });

  describe('Feature 2: query alias for params', () => {
    it('supports query option as an alias for params', async () => {
      server.use(
        http.get('https://api.test.com/search-query', ({ request }) => {
          const url = new URL(request.url);
          return HttpResponse.json({
            q: url.searchParams.get('q'),
            page: url.searchParams.get('page'),
          });
        }),
      );

      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      const { data } = await api.get<{ q: string; page: string }>('/search-query', {
        query: { q: 'nextjs', page: 2 },
      });

      expect(data.q).toBe('nextjs');
      expect(data.page).toBe('2');
    });

    it('query takes precedence if both query and params are specified', async () => {
      server.use(
        http.get('https://api.test.com/search-precedence', ({ request }) => {
          const url = new URL(request.url);
          return HttpResponse.json({ q: url.searchParams.get('q') });
        }),
      );

      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      const { data } = await api.get<{ q: string }>('/search-precedence', {
        params: { q: 'params-value' },
        query: { q: 'query-value' },
      });

      expect(data.q).toBe('query-value');
    });
  });

  describe('Feature 3: Hook chaining (Array of Interceptors)', () => {
    it('executes array of onRequest hooks sequentially', async () => {
      const order: string[] = [];

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        onRequest: [
          (config) => {
            order.push('first');
            config.headers.set('X-First', '1');
            return config;
          },
          (config) => {
            order.push('second');
            config.headers.set('X-Second', '2');
            return config;
          },
        ],
      });

      const { data } = await api.get<Record<string, string>>('/echo-headers');
      expect(order).toEqual(['first', 'second']);
      expect(data['x-first']).toBe('1');
      expect(data['x-second']).toBe('2');
    });

    it('executes array of onResponse hooks sequentially (response transformation pipeline)', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        onResponse: [
          (res) => {
            return { ...res, data: { ...(res.data as object), step1: true } };
          },
          (res) => {
            return { ...res, data: { ...(res.data as object), step2: true } };
          },
        ],
      });

      const { data } = await api.get<{ step1: boolean; step2: boolean }>('/users');
      expect(data.step1).toBe(true);
      expect(data.step2).toBe(true);
    });

    it('executes array of onError hooks sequentially', async () => {
      const errLogs: string[] = [];

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        onError: [
          (err) => {
            errLogs.push(`Logger: ${err.status}`);
          },
          (err) => {
            errLogs.push(`Toast: ${err.status}`);
          },
        ],
      });

      await expect(api.get('/error/400')).rejects.toThrow();
      expect(errLogs).toEqual(['Logger: 400', 'Toast: 400']);
    });

    it('extend() chains child hooks after parent hooks', async () => {
      const order: string[] = [];

      const parent = createFetchKit({
        baseURL: 'https://api.test.com',
        onRequest: () => {
          order.push('parent-request');
        },
      });

      const child = parent.extend({
        onRequest: () => {
          order.push('child-request');
        },
      });

      await child.get('/users');
      expect(order).toEqual(['parent-request', 'child-request']);
    });
  });

  describe('Feature 4: validateStatus & ignoreResponseError', () => {
    it('custom validateStatus allows 404 without throwing HTTP error', async () => {
      server.use(
        http.get('https://api.test.com/not-found', () => {
          return HttpResponse.json({ message: 'Resource not found' }, { status: 404 });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        validateStatus: (status) => status < 500, // 4xx won't throw
      });

      const response = await api.get<{ message: string }>('/not-found');
      expect(response.status).toBe(404);
      expect(response.data.message).toBe('Resource not found');
    });

    it('ignoreResponseError: true prevents throwing on 500', async () => {
      const api = createFetchKit({ baseURL: 'https://api.test.com' });

      const response = await api.get<{ message: string }>('/error/500', {
        ignoreResponseError: true,
      });

      expect(response.status).toBe(500);
      expect(response.data.message).toBe('Internal Server Error');
    });

    it('instance-level ignoreResponseError applies to all requests', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        ignoreResponseError: true,
      });

      const res1 = await api.get('/error/400');
      const res2 = await api.get('/error/500');

      expect(res1.status).toBe(400);
      expect(res2.status).toBe(500);
    });
  });

  describe('Feature 5: beforeRetry hook', () => {
    it('beforeRetry hook is invoked before each retry attempt', async () => {
      let attempts = 0;
      const retryLog: Array<{ attempt: number; delay: number; status?: number }> = [];

      server.use(
        http.get('https://api.test.com/before-retry-test', () => {
          attempts++;
          if (attempts < 3) {
            return HttpResponse.json({ error: 'fail' }, { status: 503 });
          }
          return HttpResponse.json({ success: true });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        retry: {
          count: 3,
          delay: 10,
          beforeRetry: ({ attempt, delay, error }) => {
            retryLog.push({ attempt, delay, status: error.status });
          },
        },
      });

      const { data } = await api.get<{ success: boolean }>('/before-retry-test');
      expect(data.success).toBe(true);
      expect(retryLog).toHaveLength(2);
      expect(retryLog[0]).toEqual({ attempt: 1, delay: 10, status: 503 });
      expect(retryLog[1]).toEqual({ attempt: 2, delay: 10, status: 503 });
    });
  });
});
