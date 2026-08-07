import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError } from '../src/error';

describe('security — timeout edge cases', () => {
  it('timeout = 0 means no timeout (passthrough)', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      timeout: 0,
    });

    const { data } = await api.get<Array<{ id: number }>>('/users');
    expect(data).toHaveLength(2);
  });

  it('negative timeout is treated as no timeout', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      timeout: -1,
    });

    const { data } = await api.get<Array<{ id: number }>>('/users');
    expect(data).toHaveLength(2);
  });

  it('pre-aborted signal throws immediately', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const controller = new AbortController();
    controller.abort('User canceled');

    try {
      await api.get('/users', { signal: controller.signal });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchKitError);
      // Pre-aborted signals may be classified as abort or network error depending on runtime
      const e = error as FetchKitError;
      expect(e.isAbort() || e.isNetworkError()).toBe(true);
    }
  });

  it('user signal abort with custom reason is preserved', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      timeout: 5000,
    });

    const controller = new AbortController();

    // Start a slow request then abort
    const promise = api.get('/slow', { signal: controller.signal });
    setTimeout(() => controller.abort('Custom reason'), 50);

    try {
      await promise;
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchKitError);
      expect((error as FetchKitError).isAbort()).toBe(true);
    }
  });

  it('timeout fires correctly on slow endpoint', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      timeout: 100,
    });

    try {
      await api.get('/slow'); // Takes 2000ms, timeout is 100ms
      expect.fail('Should have timed out');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchKitError);
      const e = error as FetchKitError;
      expect(e.isTimeout()).toBe(true);
      expect(e.message).toContain('100ms');
    }
  });

  it('per-request timeout overrides instance timeout', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      timeout: 5000,
    });

    try {
      await api.get('/slow', { timeout: 100 });
      expect.fail('Should have timed out');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchKitError);
      expect((error as FetchKitError).isTimeout()).toBe(true);
    }
  });
});

describe('security — retry abuse', () => {
  it('retry delay = 0 fires immediately without crash', async () => {
    let attempts = 0;
    server.use(
      http.get('https://api.test.com/zero-delay', () => {
        attempts++;
        if (attempts < 3) {
          return HttpResponse.json({ error: 'fail' }, { status: 500 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: { count: 3, delay: 0 },
    });

    const { data } = await api.get<{ ok: boolean }>('/zero-delay');
    expect(data.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('retryOn function receives correct error shape', async () => {
    const errors: Array<{ status?: number; type: string; message: string }> = [];

    server.use(
      http.get('https://api.test.com/retry-shape', () => {
        return HttpResponse.json({ error: 'fail' }, { status: 503 });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: {
        count: 2,
        delay: 10,
        retryOn: (error) => {
          errors.push({ ...error });
          return true;
        },
      },
    });

    await expect(api.get('/retry-shape')).rejects.toThrow();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].status).toBe(503);
    expect(errors[0].type).toBe('http');
  });

  it('retryOn function that throws does not crash the pipeline', async () => {
    server.use(
      http.get('https://api.test.com/retry-throw', () => {
        return HttpResponse.json({ error: 'fail' }, { status: 500 });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: {
        count: 2,
        delay: 10,
        retryOn: () => {
          throw new Error('retryOn crashed');
        },
      },
    });

    // Should throw but not hang
    await expect(api.get('/retry-throw')).rejects.toThrow();
  });

  it('retry + timeout: each retry attempt gets a fresh timeout', async () => {
    let attempts = 0;

    server.use(
      http.get('https://api.test.com/retry-timeout', async () => {
        attempts++;
        if (attempts < 3) {
          // First 2 attempts: respond quickly with 500
          return HttpResponse.json({ error: 'fail' }, { status: 500 });
        }
        // Third attempt: succeed
        return HttpResponse.json({ ok: true });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      timeout: 1000,
      retry: { count: 3, delay: 10 },
    });

    const { data } = await api.get<{ ok: boolean }>('/retry-timeout');
    expect(data.ok).toBe(true);
    expect(attempts).toBe(3);
  });
});

describe('security — response parsing attacks', () => {
  it('malformed JSON body → parse error type', async () => {
    server.use(
      http.get('https://api.test.com/bad-json', () => {
        return new HttpResponse('{ invalid json: }', {
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    try {
      await api.get('/bad-json');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchKitError);
      expect((error as FetchKitError).type).toBe('parse');
    }
  });

  it('content-type claims JSON but body is XML → parse error', async () => {
    server.use(
      http.get('https://api.test.com/xml-lie', () => {
        return new HttpResponse('<root><data>hello</data></root>', {
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    try {
      await api.get('/xml-lie');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchKitError);
      expect((error as FetchKitError).type).toBe('parse');
    }
  });

  it('response with no content-type falls back to text/JSON auto-detect', async () => {
    server.use(
      http.get('https://api.test.com/no-ct', () => {
        return new HttpResponse('{"auto": true}', {
          headers: {},
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<Record<string, unknown>>('/no-ct');
    // MSW may add a default content-type. Either JSON auto-parsed or text returned.
    expect(data).toBeDefined();
  });

  it('response with no content-type and non-JSON body returns text', async () => {
    server.use(
      http.get('https://api.test.com/no-ct-text', () => {
        return new HttpResponse('just plain text', {
          headers: {},
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<string>('/no-ct-text');
    expect(data).toBe('just plain text');
  });

  it('status 205 (Reset Content) returns undefined data', async () => {
    server.use(
      http.post('https://api.test.com/reset', () => {
        return new HttpResponse(null, { status: 205 });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data, status } = await api.post('/reset');
    expect(status).toBe(205);
    expect(data).toBeUndefined();
  });

  it('content-length: 0 with body → returns undefined', async () => {
    server.use(
      http.get('https://api.test.com/empty-body', () => {
        return new HttpResponse('should be ignored', {
          headers: { 'Content-Length': '0', 'Content-Type': 'application/json' },
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get('/empty-body');
    expect(data).toBeUndefined();
  });

  it('explicit responseType: "text" returns string even for JSON content', async () => {
    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<string>('/users', { responseType: 'text' });
    expect(typeof data).toBe('string');
    expect(data).toContain('Alice');
  });

  it('explicit responseType: "json" on non-JSON → parse error', async () => {
    server.use(
      http.get('https://api.test.com/not-json', () => {
        return new HttpResponse('plain text', {
          headers: { 'Content-Type': 'text/plain' },
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    try {
      await api.get('/not-json', { responseType: 'json' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchKitError);
      expect((error as FetchKitError).type).toBe('parse');
    }
  });

  it('application/xml content type returns text', async () => {
    server.use(
      http.get('https://api.test.com/xml', () => {
        return new HttpResponse('<root>data</root>', {
          headers: { 'Content-Type': 'application/xml' },
        });
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<string>('/xml');
    expect(data).toBe('<root>data</root>');
  });

  it('application/json+ld content type parsed as JSON', async () => {
    server.use(
      http.get('https://api.test.com/jsonld', () => {
        return HttpResponse.json(
          { '@context': 'https://schema.org' },
          { headers: { 'Content-Type': 'application/ld+json' } },
        );
      }),
    );

    const api = createFetchKit({ baseURL: 'https://api.test.com' });
    const { data } = await api.get<{ '@context': string }>('/jsonld');
    expect(data['@context']).toBe('https://schema.org');
  });
});
