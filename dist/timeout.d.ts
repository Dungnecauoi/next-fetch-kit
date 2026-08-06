import type { RequestContext } from './types';
/**
 * Execute a fetch with a timeout.
 *
 * Uses AbortController to race between the fetch and a timeout timer.
 * If the request already has a signal (from user's AbortController),
 * both signals are combined — either can abort the request.
 *
 * @param fetchFn - The actual fetch call to execute
 * @param timeoutMs - Timeout in milliseconds (undefined = no timeout)
 * @param existingSignal - Optional AbortSignal from the user
 * @param config - Request context for error reporting
 * @returns The fetch Response
 */
export declare function withTimeout(fetchFn: (signal: AbortSignal | undefined) => Promise<Response>, timeoutMs: number | undefined, existingSignal: AbortSignal | undefined, config?: RequestContext): Promise<Response>;
//# sourceMappingURL=timeout.d.ts.map