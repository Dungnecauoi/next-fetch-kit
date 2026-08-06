// ============================================================================
// next-fetch-kit — Cookie Forwarding (SSR/CSR)
// ============================================================================

import type { CookieStore, FetchKitConfig, RequestConfig } from './types';

/**
 * Detect if we are running on the server side (Node.js / SSR).
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Resolve the Cookie header value for a request.
 *
 * Priority:
 * 1. Per-request `cookies` option (highest priority)
 * 2. Global `forwardCookies: true` (auto-read from next/headers)
 * 3. No cookie header (browser handles via credentials)
 *
 * @param instanceConfig - The instance configuration
 * @param requestConfig - The per-request configuration
 * @returns Cookie header string or undefined
 */
export async function resolveCookieHeader(
  instanceConfig: FetchKitConfig,
  requestConfig: RequestConfig,
): Promise<string | undefined> {
  // Priority 1: Per-request cookies option
  if (requestConfig.cookies !== undefined) {
    return serializeCookieStore(requestConfig.cookies);
  }

  // Priority 2: Global forwardCookies (SSR only)
  if (instanceConfig.forwardCookies && isServer()) {
    return await getNextCookies();
  }

  // Priority 3: No cookie header (CSR uses credentials)
  return undefined;
}

/**
 * Serialize a CookieStore or string into a Cookie header value.
 */
function serializeCookieStore(cookies: CookieStore | string): string {
  if (typeof cookies === 'string') {
    return cookies;
  }

  // CookieStore interface (from next/headers cookies())
  if (typeof cookies.getAll === 'function') {
    return cookies
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }

  // Fallback: try toString
  if (typeof cookies.toString === 'function') {
    return cookies.toString();
  }

  return '';
}

/**
 * Dynamically import next/headers and read cookies.
 * Returns undefined if next/headers is not available (non-Next.js environment).
 */
async function getNextCookies(): Promise<string | undefined> {
  try {
    // Dynamic import to avoid bundling next as a hard dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = await (Function('return import("next/headers")')() as Promise<{ cookies: () => Promise<CookieStore> }>);
    const cookieStore = await mod.cookies();
    return serializeCookieStore(cookieStore);
  } catch {
    // next/headers not available or called outside of RSC/Route Handler context
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).process) {
      const env = ((globalThis as Record<string, unknown>).process as Record<string, unknown>).env as Record<string, string> | undefined;
      if (env?.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn(
          '[next-fetch-kit] forwardCookies is enabled but cookies() from next/headers ' +
            'is not available. This is expected if running outside of a Server Component, ' +
            'Route Handler, or Middleware context.',
        );
      }
    }
    return undefined;
  }
}
