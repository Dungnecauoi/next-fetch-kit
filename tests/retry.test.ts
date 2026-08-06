import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError } from '../src/error';

describe('retry', () => {
  it('retries on 500 error for GET requests', async () => {
    let attempts = 0;
    server.use(
      http.get('https://api.test.com/retry-test', () => {
        attempts++;
        if (attempts < 3) {
          return HttpResponse.json({ error: 'fail' }, { status: 500 });
        }
        return HttpResponse.json({ success: true });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: { count: 3, delay: 10 },
    });

    const { data } = await api.get<{ success: boolean }>('/retry-test');
    expect(data.success).toBe(true);
    expect(attempts).toBe(3);
  });

  it('does NOT retry POST by default', async () => {
    let attempts = 0;
    server.use(
      http.post('https://api.test.com/retry-post', () => {
        attempts++;
        return HttpResponse.json({ error: 'fail' }, { status: 500 });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: { count: 3, delay: 10 },
    });

    await expect(api.post('/retry-post')).rejects.toThrow(FetchKitError);
    expect(attempts).toBe(1); // No retry for POST
  });

  it('retries POST when methods includes POST', async () => {
    let attempts = 0;
    server.use(
      http.post('https://api.test.com/retry-post-custom', () => {
        attempts++;
        if (attempts < 2) {
          return HttpResponse.json({ error: 'fail' }, { status: 500 });
        }
        return HttpResponse.json({ success: true });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: { count: 3, delay: 10, methods: ['GET', 'POST'] },
    });

    const { data } = await api.post<{ success: boolean }>('/retry-post-custom');
    expect(data.success).toBe(true);
    expect(attempts).toBe(2);
  });

  it('exhausts retries and throws', async () => {
    server.use(
      http.get('https://api.test.com/always-fail', () => {
        return HttpResponse.json({ error: 'fail' }, { status: 500 });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: { count: 2, delay: 10 },
    });

    await expect(api.get('/always-fail')).rejects.toThrow(FetchKitError);
  });

  it('retry with number shorthand', async () => {
    let attempts = 0;
    server.use(
      http.get('https://api.test.com/retry-num', () => {
        attempts++;
        if (attempts < 2) {
          return HttpResponse.json({ error: 'fail' }, { status: 500 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: 3,
    });

    const { data } = await api.get<{ ok: boolean }>('/retry-num');
    expect(data.ok).toBe(true);
  });

  it('per-request retry: false disables retry', async () => {
    let attempts = 0;
    server.use(
      http.get('https://api.test.com/no-retry', () => {
        attempts++;
        return HttpResponse.json({ error: 'fail' }, { status: 500 });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: { count: 3, delay: 10 },
    });

    await expect(api.get('/no-retry', { retry: false })).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('retries on custom status codes via retryOn array', async () => {
    let attempts = 0;
    server.use(
      http.get('https://api.test.com/retry-custom-status', () => {
        attempts++;
        if (attempts < 2) {
          return HttpResponse.json({ error: 'rate limit' }, { status: 429 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: { count: 3, delay: 10, retryOn: [429] },
    });

    const { data } = await api.get<{ ok: boolean }>('/retry-custom-status');
    expect(data.ok).toBe(true);
    expect(attempts).toBe(2);
  });

  it('does NOT retry aborted requests', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      retry: { count: 3, delay: 10 },
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      api.get('/users', { signal: controller.signal }),
    ).rejects.toThrow();
  });
});
