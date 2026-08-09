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
  if (instanceConfig.forwardCookies) {
    if (isServer()) {
      return await getNextCookies();
    } else if ((globalThis as any).process?.env?.NODE_ENV !== 'production') {
      console.warn(
        '[next-fetch-kit] Warning: "forwardCookies" is enabled but running in a Client (CSR) environment. Cookies are handled automatically by the browser via credentials mode.',
      );
    }
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
    // Quietly return undefined if cookies() is not available or called outside active request context
    return undefined;
  }
}

/**
 * Dynamically import next/headers and read request host to resolve relative URLs in SSR.
 */
export async function getNextServerOrigin(): Promise<string> {
  try {
    const mod = await (Function('return import("next/headers")')() as Promise<{
      headers: () => Promise<Headers | { get: (key: string) => string | null }>;
    }>);
    const headerStore = await mod.headers();
    const host = typeof headerStore.get === 'function' ? headerStore.get('host') : null;
    const proto = (typeof headerStore.get === 'function' ? headerStore.get('x-forwarded-proto') : null) || 'http';
    if (host) {
      return `${proto}://${host}`;
    }
  } catch {
    // next/headers not available or outside RSC context
  }

  const proc = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process;
  const port = proc?.env?.PORT || '3000';
  return `http://localhost:${port}`;
}

