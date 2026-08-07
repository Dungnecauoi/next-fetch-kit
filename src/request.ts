// ============================================================================
// next-fetch-kit — Request Builder
// ============================================================================

import type { FetchKitConfig, RequestConfig, RequestContext, NextOptions } from './types';
import { mergeConfigs } from './merge';
import { appendParams } from './params';
import { resolveCookieHeader, isServer, getNextServerOrigin } from './cookies';

/**
 * Build a complete RequestContext from instance config + per-request config.
 *
 * Handles:
 * - URL construction (baseURL + path + params)
 * - Header merging (instance + per-request + cookie + content-type)
 * - Body serialization (JSON stringify, FormData passthrough)
 * - Next.js options (revalidate, tags)
 * - Cache mode and credentials
 */
export async function buildRequestContext(
  method: string,
  path: string,
  instanceConfig: FetchKitConfig,
  requestConfig: RequestConfig = {},
): Promise<RequestContext> {
  const merged = mergeConfigs(instanceConfig, requestConfig);

  // Build URL — support query alias for params
  const params = requestConfig.query ?? requestConfig.params;
  const baseURL = (instanceConfig.baseURL || '').replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') || path.startsWith('http') ? path : `/${path}`;
  let fullPath = path.startsWith('http') ? path : `${baseURL}${normalizedPath}`;

  // Automatically resolve relative URLs on Server side (SSR) using next/headers host or fallback
  if (isServer() && !fullPath.startsWith('http://') && !fullPath.startsWith('https://')) {
    const origin = await getNextServerOrigin();
    fullPath = `${origin}${fullPath.startsWith('/') ? '' : '/'}${fullPath}`;
  }

  const url = appendParams(fullPath, params);

  // Build headers
  const headers = merged.headers;

  // Cookie forwarding
  const cookieHeader = await resolveCookieHeader(instanceConfig, requestConfig);
  if (cookieHeader) {
    // Merge with existing Cookie header if any
    const existingCookie = headers.get('Cookie');
    if (existingCookie) {
      headers.set('Cookie', `${existingCookie}; ${cookieHeader}`);
    } else {
      headers.set('Cookie', cookieHeader);
    }
  }

  // Apply transformRequest if configured
  const transformRequest = requestConfig.transformRequest ?? instanceConfig.transformRequest;
  const rawBody = transformRequest ? transformRequest(requestConfig.body) : requestConfig.body;

  // Serialize body
  const { body, contentType } = serializeBody(rawBody);
  if (contentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', contentType);
  }

  // Build the fetch RequestInit
  const init: RequestInit & { next?: NextOptions } = {
    method: method.toUpperCase(),
    headers,
    body,
  };

  // Credentials
  if (merged.credentials) {
    init.credentials = merged.credentials;
  }

  // Signal (will be replaced by timeout wrapper if timeout is set)
  if (requestConfig.signal) {
    init.signal = requestConfig.signal;
  }

  // Next.js options
  if (merged.next) {
    init.next = merged.next;
  }

  // Cache mode
  if (merged.cache) {
    init.cache = merged.cache;
  }

  return {
    url,
    method: method.toUpperCase(),
    headers,
    body,
    init,
    requestConfig,
    instanceConfig,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SerializedBody {
  body: BodyInit | null;
  contentType: string | null;
}

function serializeBody(input: unknown): SerializedBody {
  if (input === undefined || input === null) {
    return { body: null, contentType: null };
  }

  // FormData — let the browser set Content-Type (with boundary)
  if (typeof FormData !== 'undefined' && input instanceof FormData) {
    return { body: input, contentType: null };
  }

  // Blob
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return { body: input, contentType: null };
  }

  // URLSearchParams
  if (typeof URLSearchParams !== 'undefined' && input instanceof URLSearchParams) {
    return { body: input, contentType: 'application/x-www-form-urlencoded' };
  }

  // ArrayBuffer / TypedArray
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    return { body: input as BodyInit, contentType: null };
  }

  // ReadableStream
  if (typeof ReadableStream !== 'undefined' && input instanceof ReadableStream) {
    return { body: input, contentType: null };
  }

  // String
  if (typeof input === 'string') {
    return { body: input, contentType: 'text/plain' };
  }

  // Object / Array → JSON
  return {
    body: JSON.stringify(input),
    contentType: 'application/json',
  };
}
