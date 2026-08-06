import type { FetchKitConfig, RequestConfig, RequestContext } from './types';
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
export declare function buildRequestContext(method: string, path: string, instanceConfig: FetchKitConfig, requestConfig?: RequestConfig): Promise<RequestContext>;
//# sourceMappingURL=request.d.ts.map