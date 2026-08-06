import type { FetchKitResponse, RequestContext } from './types';
/**
 * Parse a Response into a FetchKitResponse<T>.
 *
 * Auto-detects content type:
 * - `application/json` → parsed JSON
 * - `text/*` → string
 * - everything else → Blob (if in browser) or text fallback
 *
 * @param response - The raw Response from fetch
 * @param config - Request context for error reporting
 * @returns Parsed and wrapped FetchKitResponse
 */
export declare function parseResponse<T>(response: Response, config?: RequestContext): Promise<FetchKitResponse<T>>;
//# sourceMappingURL=response.d.ts.map