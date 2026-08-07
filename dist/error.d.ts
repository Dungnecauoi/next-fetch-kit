import type { FetchKitErrorType, RequestContext } from './types';
/**
 * Custom error class for all FetchKit errors.
 *
 * Provides structured error information including:
 * - `type`: The category of error (network, timeout, http, parse, abort)
 * - `status`: HTTP status code (for http errors)
 * - `data`: Parsed response body (for http errors)
 * - `config`: The request context that caused the error
 * - Helper methods: `isTimeout()`, `isNetworkError()`, `isAbort()`, `isHttpError()`
 */
export declare class FetchKitError extends Error {
    readonly name = "FetchKitError";
    readonly type: FetchKitErrorType;
    readonly status?: number;
    readonly statusText?: string;
    readonly data?: unknown;
    readonly config?: RequestContext;
    readonly response?: Response;
    constructor(message: string, options: {
        type: FetchKitErrorType;
        status?: number;
        statusText?: string;
        data?: unknown;
        config?: RequestContext;
        response?: Response;
        cause?: unknown;
    });
    /** Check if this error is a timeout */
    isTimeout(): boolean;
    /** Check if this error is a network error */
    isNetworkError(): boolean;
    /** Check if this error is an abort/cancellation */
    isAbort(): boolean;
    /** Check if this error is an HTTP error (4xx/5xx) */
    isHttpError(): boolean;
    /**
     * Create a FetchKitError from an unknown error.
     * Wraps native errors into the appropriate FetchKitError type.
     */
    static from(error: unknown, config?: RequestContext): FetchKitError;
    /**
     * Create a FetchKitError from an HTTP response (status >= 400).
     */
    static fromResponse(response: Response, config?: RequestContext): Promise<FetchKitError>;
}
/**
 * Type guard helper to check if an unknown error is a FetchKitError.
 *
 * @example
 * ```typescript
 * try {
 *   await api.get('/users');
 * } catch (err) {
 *   if (isFetchKitError(err)) {
 *     console.log(err.status, err.type);
 *   }
 * }
 * ```
 */
export declare function isFetchKitError(error: unknown): error is FetchKitError;
//# sourceMappingURL=error.d.ts.map