import type { FetchKitConfig, RequestConfig, RetryConfig, NextOptions } from './types';
/**
 * Normalize a RetryConfig from the shorthand (number) or full object form.
 */
export declare function normalizeRetry(retry: RetryConfig | number | false | undefined): RetryConfig | undefined;
/**
 * Merge two header sources into a single Headers object.
 * Later values override earlier ones for the same key.
 */
export declare function mergeHeaders(base?: HeadersInit | Record<string, string>, override?: HeadersInit | Record<string, string>): Headers;
/**
 * Merge two NextOptions objects. Override values take precedence.
 * Tags arrays are concatenated (deduplicated).
 */
export declare function mergeNextOptions(base?: NextOptions, override?: NextOptions): NextOptions | undefined;
/**
 * Deep merge instance config with per-request config to produce
 * the final resolved configuration for a single request.
 */
export declare function mergeConfigs(instanceConfig: FetchKitConfig, requestConfig: RequestConfig): {
    headers: Headers;
    credentials: RequestCredentials | undefined;
    timeout: number | undefined;
    retry: RetryConfig | undefined;
    next: NextOptions | undefined;
    cache: RequestCache | undefined;
};
/**
 * Merge two FetchKitConfig objects (for instance.extend()).
 * Hooks from override replace base hooks (not chained).
 */
export declare function mergeInstanceConfigs(base: FetchKitConfig, override: Partial<FetchKitConfig>): FetchKitConfig;
//# sourceMappingURL=merge.d.ts.map