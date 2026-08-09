// ============================================================================
// next-fetch-kit — Environment Warnings Unit Tests
// Tests dev environment runtime console warnings for misplaced SSR/CSR options.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCookieHeader } from '../src/cookies';
import { createFetchKit } from '../src/client';

describe('development environment runtime warnings', () => {
  const originalWarn = console.warn;
  let warnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    warnSpy = vi.fn();
    console.warn = warnSpy;
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  it('warns when forwardCookies: true is used in Client (CSR) environment', async () => {
    (globalThis as any).window = {};
    try {
      await resolveCookieHeader({ forwardCookies: true }, {});
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[next-fetch-kit] Warning: "forwardCookies" is enabled but running in a Client (CSR) environment',
        ),
      );
    } finally {
      delete (globalThis as any).window;
    }
  });

  it('warns when onUploadProgress is configured in Server (SSR) environment without XMLHttpRequest', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      fetch: mockFetch as typeof fetch,
    });

    await api.post('/upload', {
      body: 'test',
      onUploadProgress: () => {},
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[next-fetch-kit] Warning: "onUploadProgress" / "onDownloadProgress" is configured but running in a Server (SSR) environment',
      ),
    );
  });
});
