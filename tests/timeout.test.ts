import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError } from '../src/error';

describe('timeout', () => {
  it('times out when request exceeds timeout', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      timeout: 100, // 100ms timeout
    });

    await expect(api.get('/slow')).rejects.toThrow(FetchKitError);
    try {
      await api.get('/slow');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchKitError);
      expect((error as FetchKitError).isTimeout()).toBe(true);
    }
  });

  it('succeeds when request is within timeout', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      timeout: 5000,
    });

    const { data } = await api.get('/users');
    expect(data).toHaveLength(2);
  });

  it('per-request timeout overrides instance timeout', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      timeout: 5000,
    });

    await expect(
      api.get('/slow', { timeout: 100 }),
    ).rejects.toThrow(FetchKitError);
  });

  it('respects user AbortController signal', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
    });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    try {
      await api.get('/slow', { signal: controller.signal });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchKitError);
      expect((error as FetchKitError).isAbort()).toBe(true);
    }
  });

  it('pre-aborted signal throws immediately', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      api.get('/users', { signal: controller.signal }),
    ).rejects.toThrow();
  });
});
