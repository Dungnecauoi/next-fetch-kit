// ============================================================================
// next-fetch-kit — Progress Tracking Unit Tests (onUploadProgress & onDownloadProgress)
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { xhrFetch } from '../src/xhr';
import { createFetchKit } from '../src/client';

describe('onUploadProgress and onDownloadProgress', () => {
  it('xhrFetch unit test fallback when XMLHttpRequest is undefined', async () => {
    const originalXHR = (globalThis as any).XMLHttpRequest;
    delete (globalThis as any).XMLHttpRequest;
    const originalFetch = globalThis.fetch;
    try {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      globalThis.fetch = mockFetch;

      const res = await xhrFetch('https://api.test.com/xhr-fallback');
      expect(res).toBeDefined();
    } finally {
      (globalThis as any).XMLHttpRequest = originalXHR;
      globalThis.fetch = originalFetch;
    }
  });

  it('triggers onUploadProgress callback during upload', async () => {
    const mockUploadOnProgress = vi.fn();
    class MockXHR {
      upload = {
        onprogress: null as any,
      };
      onprogress: any = null;
      onload: any = null;
      onerror: any = null;
      ontimeout: any = null;
      status = 200;
      statusText = 'OK';
      response = new TextEncoder().encode(JSON.stringify({ ok: true })).buffer;
      open = vi.fn();
      setRequestHeader = vi.fn();
      getAllResponseHeaders = () => 'Content-Type: application/json\r\n';
      send = vi.fn().mockImplementation(function (this: any) {
        if (this.upload.onprogress) {
          this.upload.onprogress({
            lengthComputable: true,
            loaded: 500,
            total: 1000,
          });
          this.upload.onprogress({
            lengthComputable: true,
            loaded: 1000,
            total: 1000,
          });
        }
        if (this.onload) {
          this.onload();
        }
      });
    }

    const originalXHR = (globalThis as any).XMLHttpRequest;
    (globalThis as any).XMLHttpRequest = MockXHR;

    try {
      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      await api.post('/upload', {
        body: { file: 'data' },
        onUploadProgress: mockUploadOnProgress,
      });

      expect(mockUploadOnProgress).toHaveBeenCalledTimes(2);
      expect(mockUploadOnProgress).toHaveBeenNthCalledWith(1, {
        loaded: 500,
        total: 1000,
        percentage: 50,
        rate: expect.any(Number),
        estimated: undefined,
      });
      expect(mockUploadOnProgress).toHaveBeenNthCalledWith(2, {
        loaded: 1000,
        total: 1000,
        percentage: 100,
        rate: expect.any(Number),
        estimated: undefined,
      });
    } finally {
      (globalThis as any).XMLHttpRequest = originalXHR;
    }
  });

  it('triggers onDownloadProgress callback during download', async () => {
    const mockDownloadOnProgress = vi.fn();
    class MockXHR {
      upload = {};
      onprogress: any = null;
      onload: any = null;
      status = 200;
      statusText = 'OK';
      response = new TextEncoder().encode(JSON.stringify({ ok: true })).buffer;
      open = vi.fn();
      setRequestHeader = vi.fn();
      getAllResponseHeaders = () => 'Content-Type: application/json\r\n';
      send = vi.fn().mockImplementation(function (this: any) {
        if (this.onprogress) {
          this.onprogress({
            lengthComputable: true,
            loaded: 250,
            total: 1000,
          });
        }
        if (this.onload) {
          this.onload();
        }
      });
    }

    const originalXHR = (globalThis as any).XMLHttpRequest;
    (globalThis as any).XMLHttpRequest = MockXHR;

    try {
      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      await api.get('/download', {
        onDownloadProgress: mockDownloadOnProgress,
      });

      expect(mockDownloadOnProgress).toHaveBeenCalledWith({
        loaded: 250,
        total: 1000,
        percentage: 25,
        rate: expect.any(Number),
        estimated: undefined,
      });
    } finally {
      (globalThis as any).XMLHttpRequest = originalXHR;
    }
  });

  it('xhrFetch onerror, ontimeout, credentials, and signal abort handling', async () => {
    class MockErrorXHR {
      upload = {};
      onerror: any = null;
      ontimeout: any = null;
      onload: any = null;
      withCredentials = false;
      open = vi.fn();
      setRequestHeader = vi.fn();
      abort = vi.fn();
      getAllResponseHeaders = () => null;
      send = vi.fn().mockImplementation(function (this: any) {
        if (this.onerror) this.onerror();
      });
    }

    const originalXHR = (globalThis as any).XMLHttpRequest;
    (globalThis as any).XMLHttpRequest = MockErrorXHR;

    try {
      // 1. Test onerror
      await expect(
        xhrFetch('https://api.test.com/fail', {
          credentials: 'include',
          headers: { 'X-Test': '1' },
          onUploadProgress: () => {},
        }),
      ).rejects.toThrow('Network request failed');

      // 2. Test ontimeout
      class MockTimeoutXHR extends MockErrorXHR {
        send = vi.fn().mockImplementation(function (this: any) {
          if (this.ontimeout) this.ontimeout();
        });
      }
      (globalThis as any).XMLHttpRequest = MockTimeoutXHR;

      await expect(
        xhrFetch('https://api.test.com/timeout', {
          credentials: 'omit',
          onDownloadProgress: () => {},
        }),
      ).rejects.toThrow('Request timed out');

      // 3. Test pre-aborted signal
      const controller = new AbortController();
      controller.abort();
      await expect(
        xhrFetch('https://api.test.com/aborted', {
          signal: controller.signal,
          onUploadProgress: () => {},
        }),
      ).rejects.toThrow('The operation was aborted');
    } finally {
      (globalThis as any).XMLHttpRequest = originalXHR;
    }
  });
});
