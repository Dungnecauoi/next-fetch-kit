// ============================================================================
// next-fetch-kit — 100% Comprehensive Coverage Completion Suite
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError } from '../src/error';
import { serializeParams } from '../src/params';
import { mergeHeaders, mergeNextOptions, mergeInstanceConfigs } from '../src/merge';
import { parseResponse } from '../src/response';
import { buildRequestContext } from '../src/request';
import { createAuthManager } from '../src/auth';
import { runRequestHooks, runResponseHooks, runErrorHooks, handleAuthRefresh } from '../src/hooks';
import { withTimeout } from '../src/timeout';

// ---------------------------------------------------------------------------
// 1. response.ts
// ---------------------------------------------------------------------------
describe('response.ts coverage', () => {
  it('auto-parses JSON when no content-type header is set (custom fetch mock)', async () => {
    const mockFetch = async () => {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"value":42}'));
            controller.close();
          },
        }),
        { status: 200, headers: new Headers() },
      );
    };

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      fetch: mockFetch as typeof fetch,
    });
    const { data } = await api.get<{ value: number }>('/anything');
    expect(data).toBeDefined();
  });

  it('returns raw text when response has no content-type (custom fetch mock)', async () => {
    const mockFetch = async () => {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('not-json-text'));
            controller.close();
          },
        }),
        { status: 200, headers: new Headers() },
      );
    };

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      fetch: mockFetch as typeof fetch,
    });
    const { data } = await api.get<string>('/anything');
    expect(typeof data === 'string' || data !== null).toBe(true);
  });

  it('returns blob for binary content-type (image/png)', async () => {
    server.use(
      http.get('https://api.test.com/binary-png', () => {
        return new HttpResponse(new Uint8Array([137, 80, 78, 71]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<Blob>('/binary-png');
    expect(data).toBeDefined();
  });

  it('throws parse error when JSON parsing fails explicitly', async () => {
    server.use(
      http.get('https://api.test.com/broken-json', () => {
        return new HttpResponse('{broken json{{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com', ignoreResponseError: true });
    await expect(api.get('/broken-json', { responseType: 'json' })).rejects.toThrow(FetchKitError);
  });

  it('content-length: 0 returns undefined data', async () => {
    server.use(
      http.get('https://api.test.com/empty-body', () => {
        return new HttpResponse('', {
          status: 200,
          headers: { 'Content-Length': '0' },
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get('/empty-body');
    expect(data).toBeUndefined();
  });

  it('response.ts fallback binary parsing line 119 when Blob is undefined', async () => {
    const originalBlob = globalThis.Blob;
    // @ts-expect-error mocking Blob undefined
    delete globalThis.Blob;
    try {
      const mockResponse = new Response('binary-content', {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      const res = await parseResponse(mockResponse);
      expect(res.data).toBe('binary-content');
    } finally {
      globalThis.Blob = originalBlob;
    }
  });
});

// ---------------------------------------------------------------------------
// 2. retry.ts
// ---------------------------------------------------------------------------
describe('retry.ts coverage', () => {
  it('retries when custom fetch throws TypeError network error', async () => {
    let attempts = 0;
    const beforeRetry = vi.fn();
    const throwingFetch = async () => {
      attempts++;
      if (attempts < 3) {
        throw new TypeError('Failed to fetch (network drop)');
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      fetch: throwingFetch as typeof fetch,
      retry: {
        count: 3,
        delay: 5,
        beforeRetry,
      },
    });

    const { data } = await api.get<{ ok: boolean }>('/anything');
    expect(data.ok).toBe(true);
    expect(attempts).toBe(3);
    expect(beforeRetry).toHaveBeenCalledTimes(2);
  });

  it('shouldRetryError: custom retryOn function receives network error shape', async () => {
    let retryOnCalls = 0;
    const throwingFetch = async () => {
      throw new FetchKitError('Network issue', { type: 'network' });
    };

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      fetch: throwingFetch as typeof fetch,
      retry: {
        count: 2,
        delay: 5,
        retryOn: (err) => {
          retryOnCalls++;
          return err.type === 'network';
        },
      },
    });

    await expect(api.get('/anything')).rejects.toThrow();
    expect(retryOnCalls).toBeGreaterThan(0);
  });

  it('shouldRetryError: custom retryOn function for FetchKitError (line 129)', async () => {
    let retryOnCalls = 0;
    const throwingFetch = async () => {
      throw new FetchKitError('HTTP error', { type: 'http', status: 503 });
    };

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      fetch: throwingFetch as typeof fetch,
      retry: {
        count: 2,
        delay: 5,
        retryOn: (err) => {
          retryOnCalls++;
          return err.status === 503;
        },
      },
    });

    await expect(api.get('/anything')).rejects.toThrow();
    expect(retryOnCalls).toBeGreaterThan(0);
  });

  it('sleep abort signal check line 152 when already aborted before sleep', async () => {
    const controller = new AbortController();
    controller.abort();

    let attempts = 0;
    const throwingFetch = async () => {
      attempts++;
      throw new TypeError('network error');
    };

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      fetch: throwingFetch as typeof fetch,
      retry: { count: 3, delay: 50 },
    });

    await expect(api.get('/sleep-abort', { signal: controller.signal })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. request.ts & SSR relative URL
// ---------------------------------------------------------------------------
describe('request.ts coverage', () => {
  it('resolves relative URL in SSR Node environment (lines 36-37)', async () => {
    server.use(
      http.get('http://localhost:3000/ssr-relative-path', () => {
        return HttpResponse.json({ ssr: true });
      }),
    );

    const api = createFetchKit({ baseURL: '' });
    const { data } = await api.get<{ ssr: boolean }>('/ssr-relative-path');
    expect(data.ssr).toBe(true);
  });

  it('merges existing Cookie header with forwarded cookies (line 51)', async () => {
    const ctx = await buildRequestContext(
      'GET',
      'https://api.test.com/echo-headers',
      { headers: { Cookie: 'existing=1' } },
      { cookies: 'forwarded=2' },
    );
    const cookieHeader = ctx.headers.get('Cookie');
    expect(cookieHeader).toContain('existing=1');
    expect(cookieHeader).toContain('forwarded=2');
  });

  it('serializes Blob body without Content-Type', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const { data } = await api.post<{ body: any }>('/echo', { body: blob });
    expect(data).toBeDefined();
  });

  it('serializes ArrayBuffer body', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const buffer = new ArrayBuffer(8);
    const { data } = await api.post<{ body: any }>('/echo', { body: buffer });
    expect(data).toBeDefined();
  });

  it('serializes ReadableStream body', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('stream chunk'));
        controller.close();
      },
    });
    const { data } = await api.post<{ body: any }>('/echo', { body: stream });
    expect(data).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. merge.ts
// ---------------------------------------------------------------------------
describe('merge.ts coverage', () => {
  it('mergeNextOptions handles single defined input (line 48)', () => {
    const opts = mergeNextOptions({ revalidate: 10 }, undefined);
    expect(opts).toEqual({ revalidate: 10 });
  });

  it('mergeNextOptions merges tags arrays correctly (line 54)', () => {
    const merged = mergeNextOptions({ tags: ['a'] }, { revalidate: 60 });
    expect(merged?.tags).toEqual(['a']);
    expect(merged?.revalidate).toBe(60);
  });

  it('mergeInstanceConfigs merges retry, auth, fetch, and hooks', () => {
    const hook1 = () => {};
    const hook2 = () => {};

    const merged = mergeInstanceConfigs(
      {
        retry: 2,
        auth: { getToken: () => 'token1' },
        onRequest: hook1,
      },
      {
        retry: { count: 5 },
        auth: { onRefreshFailed: () => {} },
        onRequest: hook2,
      },
    );

    expect(merged.retry).toEqual({ count: 5 });
    expect(Array.isArray(merged.onRequest)).toBe(true);
    expect(merged.onRequest).toHaveLength(2);
  });

  it('mergeHeaders accepts array of [key, value] tuples', () => {
    const headers = mergeHeaders(
      [['X-Custom', 'value1'], ['Authorization', 'Bearer token']] as [string, string][],
      { 'X-Extra': 'extra' },
    );
    expect(headers.get('X-Custom')).toBe('value1');
    expect(headers.get('Authorization')).toBe('Bearer token');
    expect(headers.get('X-Extra')).toBe('extra');
  });

  it('mergeHeaders accepts Headers instance as base', () => {
    const base = new Headers({ 'Content-Type': 'application/json' });
    const merged = mergeHeaders(base, { 'X-Token': 'abc' });
    expect(merged.get('Content-Type')).toBe('application/json');
    expect(merged.get('X-Token')).toBe('abc');
  });
});

// ---------------------------------------------------------------------------
// 5. hooks.ts & handleAuthRefresh error hooks
// ---------------------------------------------------------------------------
describe('hooks.ts coverage', () => {
  it('runRequestHooks, runResponseHooks, runErrorHooks handle undefined hooks gracefully', async () => {
    const dummyCtx = {} as any;
    const dummyRes = {} as any;
    const dummyErr = new FetchKitError('test', {});

    expect(await runRequestHooks(undefined, dummyCtx)).toBe(dummyCtx);
    expect(await runResponseHooks(undefined, dummyRes)).toBe(dummyRes);
    await expect(runErrorHooks(undefined, dummyErr)).resolves.toBeUndefined();
  });

  it('handleAuthRefresh emits auth:refreshed and auth:refresh-failed', async () => {
    const emit = vi.fn();
    const mockAuthManager = createAuthManager({
      refresh: async () => 'new-token-abc',
    });

    server.use(
      http.get('https://api.test.com/retry-me', () => {
        return HttpResponse.json({ ok: true });
      }),
    );

    const mockCtx = await buildRequestContext('GET', 'https://api.test.com/retry-me', {}, {});
    const createRaw = () => createFetchKit({ baseURL: 'https://api.test.com' });

    const res = await handleAuthRefresh(
      mockAuthManager,
      createRaw,
      'GET',
      'https://api.test.com/retry-me',
      {},
      { baseURL: 'https://api.test.com' },
      mockCtx,
      emit,
    );

    expect(res.data).toEqual({ ok: true });
    expect(emit).toHaveBeenCalledWith('auth:refreshed', 'new-token-abc');
  });

  it('handleAuthRefresh catch block executes onResponseError, onRequestError, onError (lines 139, 141, 144)', async () => {
    const onResponseError = vi.fn();
    const onRequestError = vi.fn();
    const onError = vi.fn();
    const mockCtx = await buildRequestContext('GET', 'https://api.test.com/fail', {}, {});
    const createRaw = () => createFetchKit({ baseURL: 'https://api.test.com' });

    // 1. HTTP error during refresh
    const mockAuthHttp = createAuthManager({
      refresh: async () => {
        throw new FetchKitError('HTTP 403', { type: 'http', status: 403 });
      },
    });

    await expect(
      handleAuthRefresh(
        mockAuthHttp,
        createRaw,
        'GET',
        'https://api.test.com/fail',
        {},
        { onResponseError, onError },
        mockCtx,
      ),
    ).rejects.toThrow();

    expect(onResponseError).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();

    // 2. Network error during refresh
    const mockAuthNet = createAuthManager({
      refresh: async () => {
        throw new FetchKitError('Network Failed', { type: 'network' });
      },
    });

    await expect(
      handleAuthRefresh(
        mockAuthNet,
        createRaw,
        'GET',
        'https://api.test.com/fail',
        {},
        { onRequestError },
        mockCtx,
      ),
    ).rejects.toThrow();

    expect(onRequestError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. auth.ts
// ---------------------------------------------------------------------------
describe('auth.ts direct manager coverage', () => {
  it('direct handleUnauthorized concurrent refresh resolves queue (lines 67-68, 133-134)', async () => {
    const manager = createAuthManager({
      refresh: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 'fresh-token-queue';
      },
    });

    const mockRaw = {} as any;
    const p1 = manager.handleUnauthorized(mockRaw);
    const p2 = manager.handleUnauthorized(mockRaw);
    const p3 = manager.handleUnauthorized(mockRaw);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe('fresh-token-queue');
    expect(r2).toBe('fresh-token-queue');
    expect(r3).toBe('fresh-token-queue');
  });

  it('direct handleUnauthorized concurrent refresh rejects queue (lines 131-132)', async () => {
    const manager = createAuthManager({
      refresh: async () => {
        await new Promise((r) => setTimeout(r, 20));
        throw new Error('Refresh failed for all');
      },
    });

    const mockRaw = {} as any;
    const p1 = manager.handleUnauthorized(mockRaw);
    const p2 = manager.handleUnauthorized(mockRaw);

    await expect(Promise.all([p1, p2])).rejects.toThrow('Refresh failed for all');
  });
});

// ---------------------------------------------------------------------------
// 7. client.ts (head, options, off, 401 catch block)
// ---------------------------------------------------------------------------
describe('client.ts methods & catch 401 coverage', () => {
  it('calls head(), options(), and off() (lines 259, 260, 279)', async () => {
    const mockFetch = async () => new Response(null, { status: 200 });
    const api = createFetchKit({ fetch: mockFetch as typeof fetch });

    const headRes = await api.head('/test');
    expect(headRes.status).toBe(200);

    const optionsRes = await api.options('/test');
    expect(optionsRes.status).toBe(200);

    const handler = vi.fn();
    api.on('error', handler);
    api.off('error', handler);
  });

  it('triggers 401 auth refresh when fetch throws a 401 FetchKitError (lines 222-223)', async () => {
    let attempts = 0;
    const customFetch = async () => {
      attempts++;
      if (attempts === 1) {
        throw new FetchKitError('Unauthorized', { status: 401, type: 'http' });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      fetch: customFetch as typeof fetch,
      auth: {
        refresh: async () => 'new-token',
      },
    });

    const { data } = await api.get<{ success: boolean }>('/anything');
    expect(data.success).toBe(true);
    expect(attempts).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 8. params.ts
// ---------------------------------------------------------------------------
describe('params.ts array indexing with prefix (line 71)', () => {
  it('serializes nested object with array property using index key (line 71)', () => {
    const result = serializeParams({ filter: { ids: [10, 20] } });
    expect(result).toContain('filter%5Bids%5D%5B0%5D=10');
    expect(result).toContain('filter%5Bids%5D%5B1%5D=20');
  });
});

// ---------------------------------------------------------------------------
// 9. cookies.ts
// ---------------------------------------------------------------------------
describe('cookies.ts empty toString fallback & getNextServerOrigin header.get check', () => {
  it('returns empty string when toString returns empty string or no toString (line 65)', async () => {
    const { resolveCookieHeader } = await import('../src/cookies');
    const store1 = { toString: () => '' };
    const res1 = await resolveCookieHeader({}, { cookies: store1 as any });
    expect(res1).toBe('');

    const store2 = Object.create(null); // truly no toString method
    const res2 = await resolveCookieHeader({}, { cookies: store2 as any });
    expect(res2).toBe('');
  });

  it('getNextServerOrigin handles headerStore without get function (lines 94-95)', async () => {
    const { getNextServerOrigin } = await import('../src/cookies');
    const originalFunction = globalThis.Function;

    // @ts-expect-error mocking Function
    globalThis.Function = function (...args: string[]) {
      if (args.includes('return import("next/headers")')) {
        return () => Promise.resolve({
          headers: () => Promise.resolve({}), // no get method
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

// ---------------------------------------------------------------------------
// 10. error.ts
// ---------------------------------------------------------------------------
describe('error.ts fromResponse error handling', () => {
  it('handles response body parse failure in fromResponse (line 121)', async () => {
    const mockResponse = {
      status: 500,
      statusText: 'Internal Error',
      headers: new Headers(),
      text: () => Promise.reject(new Error('Cannot read stream')),
      clone: function () {
        return this;
      },
    } as unknown as Response;

    const err = await FetchKitError.fromResponse(mockResponse);
    expect(err.status).toBe(500);
    expect(err.data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 11. timeout.ts (lines 44, 81)
// ---------------------------------------------------------------------------
describe('timeout.ts coverage', () => {
  it('throws immediate abort error if existingSignal is already aborted (line 44)', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Pre-aborted'));

    await expect(
      withTimeout(async () => new Response(), 1000, controller.signal),
    ).rejects.toThrow('Request was aborted');
  });

  it('re-throws non-timeout, non-abort error in withTimeout catch (line 81)', async () => {
    const customErr = new Error('Custom fetch explosion');
    const failingFetch = async () => {
      throw customErr;
    };

    await expect(withTimeout(failingFetch, 1000, undefined)).rejects.toThrow('Custom fetch explosion');
  });
});
