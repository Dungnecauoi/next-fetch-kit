import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError } from '../src/error';

describe('interceptors (hooks)', () => {
  it('onRequest modifies headers before sending', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onRequest(config) {
        config.headers.set('X-Intercepted', 'true');
        return config;
      },
    });

    const { data } = await api.get<Record<string, string>>('/echo-headers');
    expect(data['x-intercepted']).toBe('true');
  });

  it('onRequest can be async', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      async onRequest(config) {
        await new Promise((r) => setTimeout(r, 10));
        config.headers.set('X-Async', 'yes');
        return config;
      },
    });

    const { data } = await api.get<Record<string, string>>('/echo-headers');
    expect(data['x-async']).toBe('yes');
  });

  it('onResponse is called with successful response', async () => {
    const onResponse = vi.fn((response) => response);

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onResponse,
    });

    await api.get('/users');
    expect(onResponse).toHaveBeenCalledOnce();
    expect(onResponse.mock.calls[0][0].status).toBe(200);
  });

  it('onResponse can transform the response', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onResponse(response) {
        return {
          ...response,
          data: { transformed: true },
        };
      },
    });

    const { data } = await api.get<{ transformed: boolean }>('/users');
    expect(data.transformed).toBe(true);
  });

  it('onRequestError is called on network errors', async () => {
    const onRequestError = vi.fn();

    server.use(
      http.get('https://api.test.com/network-fail', () => {
        return HttpResponse.error();
      }),
    );

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onRequestError,
    });

    await expect(api.get('/network-fail')).rejects.toThrow();
    expect(onRequestError).toHaveBeenCalledOnce();
  });

  it('onResponseError is called on HTTP errors', async () => {
    const onResponseError = vi.fn();

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onResponseError,
    });

    await expect(api.get('/error/400')).rejects.toThrow();
    expect(onResponseError).toHaveBeenCalledOnce();
    expect(onResponseError.mock.calls[0][0].status).toBe(400);
  });

  it('onResponseError is not called for successful responses', async () => {
    const onResponseError = vi.fn();

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onResponseError,
    });

    await api.get('/users');
    expect(onResponseError).not.toHaveBeenCalled();
  });

  it('onRequestError is not called for HTTP errors', async () => {
    const onRequestError = vi.fn();

    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      onRequestError,
    });

    await expect(api.get('/error/500')).rejects.toThrow();
    expect(onRequestError).not.toHaveBeenCalled();
  });
});
