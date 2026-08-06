import type { RetryConfig, RequestContext } from './types';
/**
 * Execute a function with retry logic.
 *
 * @param fn - The async function to retry
 * @param retryConfig - Retry configuration
 * @param method - HTTP method (to check idempotency)
 * @param config - Request context for error reporting
 * @returns The successful Response
 */
export declare function withRetry(fn: () => Promise<Response>, retryConfig: RetryConfig | undefined, method: string, config?: RequestContext): Promise<Response>;
//# sourceMappingURL=retry.d.ts.map