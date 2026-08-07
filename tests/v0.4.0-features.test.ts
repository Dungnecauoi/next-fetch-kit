import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { serializeParams } from '../src/params';
import { FetchKitError } from '../src/error';

describe('v0.4.0 features — Deduplication, Event Bus, Transformers & MaxDelay', () => {
  describe('Feature 1: In-flight Request Deduplication (dedupe)', () => {
    it('merges simultaneous identical GET requests into 1 network call', async () => {
      let networkCalls = 0;

      server.use(
        http.get('https://api.test.com/dedupe-test', async () => {
          networkCalls++;
          await new Promise((r) => setTimeout(r, 40));
          return HttpResponse.json({ id: networkCalls, timestamp: Date.now() });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        dedupe: true,
      });

      // Fire 5 requests simultaneously at the exact same tick
      const promises = [
        api.get<{ id: number }>('/dedupe-test'),
        api.get<{ id: number }>('/dedupe-test'),
        api.get<{ id: number }>('/dedupe-test'),
        api.get<{ id: number }>('/dedupe-test'),
        api.get<{ id: number }>('/dedupe-test'),
      ];

      const results = await Promise.all(promises);

      // All 5 requests should receive the exact same response object from the 1 network call
      expect(results).toHaveLength(5);
      expect(networkCalls).toBe(1);
      expect(results[0].data.id).toBe(1);
      expect(results[4].data.id).toBe(1);
    });

    it('subsequent request AFTER first request completes makes a new network call', async () => {
      let networkCalls = 0;

      server.use(
        http.get('https://api.test.com/dedupe-seq', () => {
          networkCalls++;
          return HttpResponse.json({ id: networkCalls });
        }),
      );

      const api = createFetchKit({ baseURL: 'https://api.test.com', dedupe: true });

      const first = await api.get<{ id: number }>('/dedupe-seq');
      expect(first.data.id).toBe(1);

      const second = await api.get<{ id: number }>('/dedupe-seq');
      expect(second.data.id).toBe(2);

      expect(networkCalls).toBe(2);
    });

    it('per-request dedupe: false disables deduplication for specific request', async () => {
      let networkCalls = 0;

      server.use(
        http.get('https://api.test.com/no-dedupe', async () => {
          networkCalls++;
          await new Promise((r) => setTimeout(r, 20));
          return HttpResponse.json({ id: networkCalls });
        }),
      );

      const api = createFetchKit({ baseURL: 'https://api.test.com', dedupe: true });

      const promises = [
        api.get('/no-dedupe', { dedupe: false }),
        api.get('/no-dedupe', { dedupe: false }),
      ];

      await Promise.all(promises);
      expect(networkCalls).toBe(2);
    });
  });

  describe('Feature 2: Retry maxDelay Cap', () => {
    it('caps retry delay at maxDelay limit', async () => {
      const delays: number[] = [];

      server.use(
        http.get('https://api.test.com/max-delay-test', () => {
          return HttpResponse.json({ error: 'fail' }, { status: 503 });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        retry: {
          count: 3,
          delay: 100,
          backoff: true,
          maxDelay: 150, // Cap backoff at 150ms
          beforeRetry: ({ delay }) => {
            delays.push(delay);
          },
        },
      });

      await expect(api.get('/max-delay-test')).rejects.toThrow();

      // Exponential backoff would be: 100, 200, 400
      // With maxDelay: 150, all delays >= 150 should be capped at 150
      expect(delays.length).toBe(3);
      for (const d of delays) {
        expect(d).toBeLessThanOrEqual(150);
      }
    });
  });

  describe('Feature 3: Global Event Emitter (api.on / api.off)', () => {
    it('emits request and response events on successful request', async () => {
      const onRequest = vi.fn();
      const onResponse = vi.fn();

      const api = createFetchKit({ baseURL: 'https://api.test.com' });

      api.on('request', onRequest);
      api.on('response', onResponse);

      await api.get('/users');

      expect(onRequest).toHaveBeenCalledOnce();
      expect(onResponse).toHaveBeenCalledOnce();
    });

    it('emits error event when request fails', async () => {
      const onError = vi.fn();
      const api = createFetchKit({ baseURL: 'https://api.test.com' });

      api.on('error', onError);

      await expect(api.get('/error/400')).rejects.toThrow();
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(FetchKitError);
    });

    it('unsubscribe function returned by api.on() stops listening', async () => {
      const onRequest = vi.fn();
      const api = createFetchKit({ baseURL: 'https://api.test.com' });

      const unsubscribe = api.on('request', onRequest);

      await api.get('/users');
      expect(onRequest).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      await api.get('/users');
      expect(onRequest).toHaveBeenCalledTimes(1); // Still 1
    });

    it('emits auth:refreshed event on successful token refresh', async () => {
      let callCount = 0;
      const onAuthRefreshed = vi.fn();

      server.use(
        http.get('https://api.test.com/event-auth', () => {
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
          getToken: () => (callCount === 0 ? 'expired' : 'fresh'),
          refresh: async () => 'fresh',
        },
      });

      api.on('auth:refreshed', onAuthRefreshed);

      await api.get('/event-auth');
      expect(onAuthRefreshed).toHaveBeenCalledWith('fresh');
    });
  });

  describe('Feature 4: Data Transformers (transformRequest & transformResponse)', () => {
    it('transformRequest transforms request body before sending', async () => {
      server.use(
        http.post('https://api.test.com/echo-trans-req', async ({ request }) => {
          const body = await request.json();
          return HttpResponse.json({ received: body });
        }),
      );

      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        transformRequest: (data) => {
          const obj = data as Record<string, unknown>;
          return { ...obj, transformed: true };
        },
      });

      const { data } = await api.post<{ received: { name: string; transformed: boolean } }>(
        '/echo-trans-req',
        { body: { name: 'Alice' } },
      );

      expect(data.received.name).toBe('Alice');
      expect(data.received.transformed).toBe(true);
    });

    it('transformResponse transforms response data after parsing', async () => {
      const api = createFetchKit({
        baseURL: 'https://api.test.com',
        transformResponse: (data) => {
          if (Array.isArray(data)) {
            return data.map((item) => ({ ...item, uppercaseName: item.name.toUpperCase() }));
          }
          return data;
        },
      });

      const { data } = await api.get<Array<{ id: number; name: string; uppercaseName: string }>>(
        '/users',
      );

      expect(data[0].uppercaseName).toBe('ALICE');
      expect(data[1].uppercaseName).toBe('BOB');
    });
  });

  describe('Feature 5: Extended Params Serialization (Set, Map, BigInt)', () => {
    it('serializes Set into indexed array params', () => {
      const result = serializeParams({ ids: new Set([10, 20, 30]) });
      expect(result).toContain('ids%5B0%5D=10');
      expect(result).toContain('ids%5B1%5D=20');
      expect(result).toContain('ids%5B2%5D=30');
    });

    it('serializes Map into object key-value params', () => {
      const map = new Map<string, unknown>([
        ['status', 'active'],
        ['role', 'admin'],
      ]);
      const result = serializeParams({ filter: map });
      expect(result).toContain('filter%5Bstatus%5D=active');
      expect(result).toContain('filter%5Brole%5D=admin');
    });

    it('serializes BigInt values correctly', () => {
      const result = serializeParams({ bigId: 9007199254740991n });
      expect(result).toBe('bigId=9007199254740991');
    });
  });
});
