import type { FetchKitConfig, RequestConfig } from './types';
/**
 * Detect if we are running on the server side (Node.js / SSR).
 */
export declare function isServer(): boolean;
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
export declare function resolveCookieHeader(instanceConfig: FetchKitConfig, requestConfig: RequestConfig): Promise<string | undefined>;
/**
 * Dynamically import next/headers and read request host to resolve relative URLs in SSR.
 */
export declare function getNextServerOrigin(): Promise<string>;
//# sourceMappingURL=cookies.d.ts.map