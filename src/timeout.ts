// ============================================================================
// next-fetch-kit — Timeout Handler
// ============================================================================

import { FetchKitError } from './error';
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
export async function withTimeout(
  fetchFn: (signal: AbortSignal | undefined) => Promise<Response>,
  timeoutMs: number | undefined,
  existingSignal: AbortSignal | undefined,
  config?: RequestContext,
): Promise<Response> {
  // No timeout configured — just pass through the existing signal
  if (!timeoutMs) {
    return fetchFn(existingSignal);
  }

  const timeoutController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Combine user signal with timeout signal
  const combinedController = new AbortController();

  const onExistingAbort = () => combinedController.abort(existingSignal?.reason);
  const onTimeoutAbort = () => combinedController.abort(timeoutController.signal.reason);

  if (existingSignal) {
    // If user already aborted, abort immediately
    if (existingSignal.aborted) {
      throw new FetchKitError('Request was aborted', {
        type: 'abort',
        config,
        cause: existingSignal.reason,
      });
    }
    existingSignal.addEventListener('abort', onExistingAbort, { once: true });
  }

  timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

  try {
    // Start the timeout timer
    timeoutId = setTimeout(() => {
      timeoutController.abort(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const response = await fetchFn(combinedController.signal);
    return response;
  } catch (error) {
    // Determine if the abort was from timeout or user
    if (timeoutController.signal.aborted) {
      throw new FetchKitError(`Request timed out after ${timeoutMs}ms`, {
        type: 'timeout',
        config,
        cause: error,
      });
    }

    if (existingSignal?.aborted) {
      throw new FetchKitError('Request was aborted', {
        type: 'abort',
        config,
        cause: error,
      });
    }

    throw error;
  } finally {
    // Cleanup
    if (timeoutId) clearTimeout(timeoutId);
    if (existingSignal) {
      existingSignal.removeEventListener('abort', onExistingAbort);
    }
    timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
  }
}
