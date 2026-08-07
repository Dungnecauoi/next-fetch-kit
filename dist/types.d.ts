/**
 * Next.js specific fetch options.
 * Passed through to the native Next.js extended fetch.
 */
export interface NextOptions {
    /** Time-based revalidation in seconds */
    revalidate?: number | false;
    /** Cache tags for on-demand revalidation */
    tags?: string[];
}
/**
 * Retry configuration.
 */
/**
 * Utility type allowing a single hook function or an array of hook functions.
 */
export type HookOrArray<T> = T | T[];
/**
 * Event names supported by FetchKit event emitter.
 */
export type FetchKitEventType = 'request' | 'response' | 'error' | 'retry' | 'auth:refreshed' | 'auth:refresh-failed';
/**
 * Event handler function shape.
 */
export type FetchKitEventHandler = (payload: any) => void;
/**
 * Details passed to the beforeRetry callback.
 */
export interface BeforeRetryDetails {
    /** Current attempt number (1-based index) */
    attempt: number;
    /** Delay in milliseconds before this retry attempt */
    delay: number;
    /** Error that triggered the retry */
    error: FetchKitErrorLike;
}
/**
 * Retry configuration.
 */
export interface RetryConfig {
    /** Number of retry attempts (default: 0) */
    count: number;
    /** Delay between retries in ms (default: 1000) */
    delay?: number;
    /** Maximum delay cap in ms for backoff (default: 30000) */
    maxDelay?: number;
    /** Use exponential backoff (default: false) */
    backoff?: boolean;
    /**
     * Custom condition for retrying.
     * - Array of status codes to retry on
     * - Function returning true to retry
     * Default: retry on network errors and 408, 429, 500, 502, 503, 504
     */
    retryOn?: number[] | ((error: FetchKitErrorLike) => boolean);
    /** HTTP methods to retry (default: ['GET', 'HEAD', 'OPTIONS']) */
    methods?: string[];
    /** Callback invoked right before each retry attempt */
    beforeRetry?: (details: BeforeRetryDetails) => void | Promise<void>;
}
/**
 * Minimal error shape for retry condition checking.
 */
export interface FetchKitErrorLike {
    status?: number;
    type: string;
    message: string;
}
/**
 * Auth configuration for automatic token management and refresh.
 */
export interface AuthConfig {
    /**
     * Get the current access token.
     * Called before each request to set the Authorization header.
     * Return undefined/null to skip setting the header (cookie-based auth).
     */
    getToken?: () => string | null | undefined | Promise<string | null | undefined>;
    /**
     * Refresh the access token when a 401 is received.
     * - Return a new token string (header-based auth)
     * - Return void/undefined (cookie-based auth — server sets new cookie)
     *
     * The fetchKit instance passed here is a raw instance without auth
     * interceptors to prevent refresh loops.
     */
    refresh?: (fetchKit: FetchKitInstance) => Promise<string | void>;
    /**
     * Called after a successful token refresh.
     * Use this to persist the new token (e.g., localStorage, memory).
     */
    onRefreshed?: (newToken: string) => void | Promise<void>;
    /**
     * Called when refresh fails (e.g., refresh token expired).
     * Use this to logout, redirect to login page, etc.
     */
    onRefreshFailed?: (error: unknown) => void | Promise<void>;
}
/**
 * Interceptor hooks for request/response lifecycle.
 * Accepts a single function or an array of functions (chaining).
 */
export interface InterceptorHooks {
    /**
     * Called before each request is sent.
     * Modify headers, log, etc. Return the (optionally modified) config.
     */
    onRequest?: HookOrArray<(config: RequestContext) => RequestContext | Promise<RequestContext>>;
    /**
     * Called after a successful response (2xx).
     * Can transform the response.
     */
    onResponse?: HookOrArray<(response: FetchKitResponse<unknown>) => FetchKitResponse<unknown> | void | Promise<FetchKitResponse<unknown> | void>>;
    /**
     * Called when a request fails (network error, timeout, abort).
     */
    onRequestError?: HookOrArray<(error: FetchKitErrorInstance) => void | Promise<void>>;
    /**
     * Called when a response has an HTTP error status (4xx, 5xx).
     */
    onResponseError?: HookOrArray<(error: FetchKitErrorInstance) => void | Promise<void>>;
    /**
     * Universal error handler called for ALL errors (HTTP errors, network errors, timeouts, aborts).
     * Useful for global toast notifications or centralized logging.
     */
    onError?: HookOrArray<(error: FetchKitErrorInstance) => void | Promise<void>>;
}
/**
 * Cookie store interface compatible with Next.js cookies() return type.
 */
export interface CookieStore {
    getAll(): Array<{
        name: string;
        value: string;
    }>;
    toString?(): string;
}
/**
 * Configuration for creating a FetchKit instance.
 */
export interface FetchKitConfig extends InterceptorHooks {
    /** Base URL prepended to all request paths */
    baseURL?: string;
    /** Default headers for all requests */
    headers?: HeadersInit | Record<string, string>;
    /** Request credentials mode (default: 'same-origin') */
    credentials?: RequestCredentials;
    /** Timeout in milliseconds (default: no timeout) */
    timeout?: number;
    /** Retry configuration */
    retry?: RetryConfig | number;
    /** Default Next.js fetch options */
    next?: NextOptions;
    /** Default cache mode */
    cache?: RequestCache;
    /**
     * Explicit response type parsing mode.
     * Default: auto-detect JSON, text, or blob.
     */
    responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
    /**
     * Auto-forward cookies from Next.js server context (SSR).
     * When true, automatically reads cookies() from next/headers
     * and sets the Cookie header on requests.
     * In CSR, this option is ignored (browser handles cookies via credentials).
     */
    forwardCookies?: boolean;
    /** Auth configuration for token management and auto-refresh */
    auth?: AuthConfig;
    /**
     * Custom fetch implementation to use instead of globalThis.fetch.
     * Useful for testing, custom proxies, or Edge Runtime mock fetch.
     */
    fetch?: typeof fetch;
    /**
     * Custom status validator function to determine if an HTTP status code is valid.
     * Default: status >= 200 && status < 300
     */
    validateStatus?: (status: number) => boolean;
    /**
     * When true, disables HTTP error throwing for 4xx/5xx status codes.
     * Shortcut for validateStatus: () => true.
     */
    ignoreResponseError?: boolean;
    /**
     * When true, automatically deduplicates simultaneous identical in-flight GET/HEAD requests.
     */
    dedupe?: boolean;
    /**
     * Custom request data transformer called before body serialization.
     */
    transformRequest?: (data: unknown) => unknown;
    /**
     * Custom response data transformer called after body parsing.
     */
    transformResponse?: (data: unknown) => unknown;
}
/**
 * Per-request configuration options.
 */
export interface RequestConfig {
    /** URL query parameters (alias for query) */
    params?: Record<string, unknown>;
    /** URL query parameters (alias for params) */
    query?: Record<string, unknown>;
    /** Request body — auto-stringified for objects, passthrough for FormData */
    body?: unknown;
    /** Override headers for this request */
    headers?: HeadersInit | Record<string, string>;
    /** Override credentials for this request */
    credentials?: RequestCredentials;
    /** Override timeout for this request */
    timeout?: number;
    /** Override retry for this request */
    retry?: RetryConfig | number | false;
    /** Next.js fetch options for this request */
    next?: NextOptions;
    /** Cache mode for this request */
    cache?: RequestCache;
    /**
     * Explicit response type parsing mode.
     * Default: auto-detect JSON, text, or blob.
     */
    responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /**
     * Cookie store for this specific request (SSR).
     * Overrides the global forwardCookies setting.
     * Pass the result of cookies() from next/headers.
     */
    cookies?: CookieStore | string;
    /**
     * Custom fetch implementation for this specific request.
     */
    fetch?: typeof fetch;
    /**
     * Custom status validator function for this request.
     */
    validateStatus?: (status: number) => boolean;
    /**
     * When true, disables HTTP error throwing for 4xx/5xx status codes for this request.
     */
    ignoreResponseError?: boolean;
    /**
     * Override in-flight request deduplication for this request.
     */
    dedupe?: boolean;
    /**
     * Custom request data transformer for this request.
     */
    transformRequest?: (data: unknown) => unknown;
    /**
     * Custom response data transformer for this request.
     */
    transformResponse?: (data: unknown) => unknown;
}
/**
 * Internal request context passed through the pipeline.
 */
export interface RequestContext {
    /** Full URL (baseURL + path + params) */
    url: string;
    /** HTTP method */
    method: string;
    /** Headers object */
    headers: Headers;
    /** Serialized body (string | FormData | null) */
    body: BodyInit | null;
    /** Fetch RequestInit to pass to native fetch */
    init: RequestInit & {
        next?: NextOptions;
    };
    /** Original per-request config */
    requestConfig: RequestConfig;
    /** Resolved instance config */
    instanceConfig: FetchKitConfig;
}
/**
 * Wrapped response returned by all FetchKit methods.
 */
export interface FetchKitResponse<T> {
    /** Parsed response data */
    data: T;
    /** HTTP status code */
    status: number;
    /** HTTP status text */
    statusText: string;
    /** Response headers */
    headers: Headers;
    /** Raw Response object for advanced usage */
    raw: Response;
}
/**
 * Error types for FetchKitError.
 */
export type FetchKitErrorType = 'network' | 'timeout' | 'http' | 'parse' | 'abort';
/**
 * FetchKitError instance shape (for typing, actual class in error.ts).
 */
export interface FetchKitErrorInstance {
    name: string;
    message: string;
    type: FetchKitErrorType;
    status?: number;
    statusText?: string;
    data?: unknown;
    config?: RequestContext;
    response?: Response;
    isTimeout(): boolean;
    isNetworkError(): boolean;
    isAbort(): boolean;
    isHttpError(): boolean;
}
/**
 * The FetchKit instance returned by createFetchKit().
 */
export interface FetchKitInstance {
    get<T = unknown>(path: string, config?: RequestConfig): Promise<FetchKitResponse<T>>;
    post<T = unknown>(path: string, config?: RequestConfig): Promise<FetchKitResponse<T>>;
    put<T = unknown>(path: string, config?: RequestConfig): Promise<FetchKitResponse<T>>;
    patch<T = unknown>(path: string, config?: RequestConfig): Promise<FetchKitResponse<T>>;
    delete<T = unknown>(path: string, config?: RequestConfig): Promise<FetchKitResponse<T>>;
    head<T = unknown>(path: string, config?: RequestConfig): Promise<FetchKitResponse<T>>;
    options<T = unknown>(path: string, config?: RequestConfig): Promise<FetchKitResponse<T>>;
    extend(overrides: Partial<FetchKitConfig>): FetchKitInstance;
    /**
     * Subscribe to global API lifecycle events.
     * Returns an unsubscribe function.
     */
    on(event: FetchKitEventType, handler: FetchKitEventHandler): () => void;
    /**
     * Unsubscribe from global API lifecycle events.
     */
    off(event: FetchKitEventType, handler: FetchKitEventHandler): void;
}
//# sourceMappingURL=types.d.ts.map