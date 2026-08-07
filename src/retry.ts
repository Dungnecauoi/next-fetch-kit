// ============================================================================
// next-fetch-kit — Retry Engine
// ============================================================================

import { FetchKitError } from './error';
import type { RetryConfig, RequestContext } from './types';

/** Default status codes that trigger a retry */
const DEFAULT_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/** Default HTTP methods that are safe to retry (idempotent) */
const DEFAULT_RETRY_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Execute a function with retry logic.
 *
 * @param fn - The async function to retry
 * @param retryConfig - Retry configuration
 * @param method - HTTP method (to check idempotency)
 * @param config - Request context for error reporting
 * @returns The successful Response
 */
export async function withRetry(
  fn: () => Promise<Response>,
  retryConfig: RetryConfig | undefined,
  method: string,
  config?: RequestContext,
): Promise<Response> {
  if (!retryConfig || retryConfig.count <= 0) {
    return fn();
  }

  const {
    count,
    delay = 1000,
    backoff = false,
    retryOn,
    methods = DEFAULT_RETRY_METHODS,
    beforeRetry,
  } = retryConfig;

  // Check if this HTTP method is retryable
  if (!methods.includes(method.toUpperCase())) {
    return fn();
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= count; attempt++) {
    try {
      const response = await fn();

      // Check if response status should trigger a retry
      if (attempt < count && shouldRetryResponse(response.status, retryOn)) {
        const err = await FetchKitError.fromResponse(response.clone(), config);
        lastError = err;
        const retryDelay = calculateDelay(delay, attempt, backoff);
        if (beforeRetry) {
          await beforeRetry({ attempt: attempt + 1, delay: retryDelay, error: err });
        }
        await sleep(retryDelay, config?.requestConfig.signal);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      // Don't retry aborted requests or timeouts (user intentional)
      if (error instanceof FetchKitError) {
        if (error.isAbort()) throw error;
      }

      // Don't retry on last attempt
      if (attempt >= count) break;

      // Check custom retry condition
      if (!shouldRetryError(error, retryOn)) break;

      const retryDelay = calculateDelay(delay, attempt, backoff);
      if (beforeRetry) {
        const errShape =
          error instanceof FetchKitError
            ? error
            : { type: 'network', message: error instanceof Error ? error.message : String(error) };
        await beforeRetry({ attempt: attempt + 1, delay: retryDelay, error: errShape });
      }
      await sleep(retryDelay, config?.requestConfig.signal);
    }
  }

  // All retries exhausted
  if (lastError instanceof FetchKitError) throw lastError;
  throw FetchKitError.from(lastError, config);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function shouldRetryResponse(
  status: number,
  retryOn?: number[] | ((error: { status?: number; type: string; message: string }) => boolean),
): boolean {
  if (!retryOn) {
    return DEFAULT_RETRY_STATUS_CODES.includes(status);
  }

  if (Array.isArray(retryOn)) {
    return retryOn.includes(status);
  }

  return retryOn({ status, type: 'http', message: `HTTP ${status}` });
}

function shouldRetryError(
  error: unknown,
  retryOn?: number[] | ((error: { status?: number; type: string; message: string }) => boolean),
): boolean {
  // Network errors are always retryable by default
  if (error instanceof FetchKitError && error.isNetworkError()) {
    if (!retryOn || Array.isArray(retryOn)) return true;
    return retryOn({ type: error.type, message: error.message, status: error.status });
  }

  // For custom retryOn function, pass the error info
  if (typeof retryOn === 'function' && error instanceof FetchKitError) {
    return retryOn({ type: error.type, message: error.message, status: error.status });
  }

  // Default: retry on network-like errors
  return error instanceof TypeError;
}

function calculateDelay(baseDelay: number, attempt: number, backoff: boolean): number {
  if (!backoff) return baseDelay;
  // Exponential backoff with jitter
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = exponential * 0.1 * Math.random();
  return exponential + jitter;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(
        new FetchKitError('Request was aborted', {
          type: 'abort',
          cause: signal.reason,
        }),
      );
    }

    const timer = setTimeout(resolve, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(
        new FetchKitError('Request was aborted', {
          type: 'abort',
          cause: signal?.reason,
        }),
      );
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
