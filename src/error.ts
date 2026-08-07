// ============================================================================
// next-fetch-kit — Error System
// ============================================================================

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
export class FetchKitError extends Error {
  readonly name = 'FetchKitError';
  readonly type: FetchKitErrorType;
  readonly status?: number;
  readonly statusText?: string;
  readonly data?: unknown;
  readonly config?: RequestContext;
  readonly response?: Response;

  constructor(
    message: string,
    options: {
      type: FetchKitErrorType;
      status?: number;
      statusText?: string;
      data?: unknown;
      config?: RequestContext;
      response?: Response;
      cause?: unknown;
    },
  ) {
    super(message);
    // Manually set cause for ES2020 compatibility
    if (options.cause) {
      (this as Record<string, unknown>).cause = options.cause;
    }
    this.type = options.type;
    this.status = options.status;
    this.statusText = options.statusText;
    this.data = options.data;
    this.config = options.config;
    this.response = options.response;
  }

  /** Check if this error is a timeout */
  isTimeout(): boolean {
    return this.type === 'timeout';
  }

  /** Check if this error is a network error */
  isNetworkError(): boolean {
    return this.type === 'network';
  }

  /** Check if this error is an abort/cancellation */
  isAbort(): boolean {
    return this.type === 'abort';
  }

  /** Check if this error is an HTTP error (4xx/5xx) */
  isHttpError(): boolean {
    return this.type === 'http';
  }

  /**
   * Create a FetchKitError from an unknown error.
   * Wraps native errors into the appropriate FetchKitError type.
   */
  static from(error: unknown, config?: RequestContext): FetchKitError {
    if (error instanceof FetchKitError) {
      return error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return new FetchKitError('Request was aborted', {
        type: 'abort',
        config,
        cause: error,
      });
    }

    if (error instanceof TypeError) {
      // fetch() throws TypeError for network failures
      return new FetchKitError(error.message || 'Network error', {
        type: 'network',
        config,
        cause: error,
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    return new FetchKitError(message, {
      type: 'network',
      config,
      cause: error,
    });
  }

  /**
   * Create a FetchKitError from an HTTP response (status >= 400).
   */
  static async fromResponse(
    response: Response,
    config?: RequestContext,
  ): Promise<FetchKitError> {
    let data: unknown;
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    } catch {
      data = undefined;
    }

    return new FetchKitError(
      `HTTP Error ${response.status}: ${response.statusText || 'Unknown'}`,
      {
        type: 'http',
        status: response.status,
        statusText: response.statusText,
        data,
        config,
        response,
      },
    );
  }
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
export function isFetchKitError(error: unknown): error is FetchKitError {
  return error instanceof FetchKitError || (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<string, unknown>).name === 'FetchKitError' &&
    typeof (error as Record<string, unknown>).type === 'string'
  );
}
