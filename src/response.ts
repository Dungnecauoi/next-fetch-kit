// ============================================================================
// next-fetch-kit — Response Parser
// ============================================================================

import type { FetchKitResponse, RequestContext } from './types';
import { FetchKitError } from './error';

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
export async function parseResponse<T>(
  response: Response,
  config?: RequestContext,
): Promise<FetchKitResponse<T>> {
  // Determine status validity
  const ignoreResponseError =
    config?.requestConfig.ignoreResponseError ?? config?.instanceConfig.ignoreResponseError;

  const validateStatus =
    ignoreResponseError
      ? () => true
      : config?.requestConfig.validateStatus ??
        config?.instanceConfig.validateStatus ??
        ((status: number) => status >= 200 && status < 300);

  const isValidStatus = validateStatus(response.status);

  // Check for HTTP errors (4xx, 5xx) if status is invalid
  if (!isValidStatus) {
    throw await FetchKitError.fromResponse(response, config);
  }

  let data = await parseBody<T>(response, config);

  // Apply transformResponse if configured
  const transformResponse =
    config?.requestConfig.transformResponse ?? config?.instanceConfig.transformResponse;
  if (transformResponse && data !== undefined) {
    data = transformResponse(data) as Awaited<T>;
  }

  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    raw: response,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function parseBody<T>(response: Response, config?: RequestContext): Promise<T> {
  // No content
  if (response.status === 204 || response.status === 205 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const responseType = config?.requestConfig.responseType || config?.instanceConfig.responseType;

  try {
    // Explicit responseType overrides auto-detection
    if (responseType === 'json') {
      return (await response.json()) as T;
    }
    if (responseType === 'text') {
      return (await response.text()) as unknown as T;
    }
    if (responseType === 'blob') {
      return (await response.blob()) as unknown as T;
    }
    if (responseType === 'arrayBuffer') {
      return (await response.arrayBuffer()) as unknown as T;
    }

    // Auto-detection logic
    const contentType = response.headers.get('content-type') || '';

    // JSON
    if (contentType.includes('application/json') || contentType.includes('+json')) {
      return (await response.json()) as T;
    }

    // Text-based content types
    if (
      contentType.includes('text/') ||
      contentType.includes('application/xml') ||
      contentType.includes('application/javascript')
    ) {
      return (await response.text()) as unknown as T;
    }

    // Binary — try to detect from content
    // If content-type is not set, try JSON first (common API pattern)
    if (!contentType) {
      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    // Fallback for binary content types — return as Blob in browser, text in Node
    if (typeof Blob !== 'undefined') {
      return (await response.blob()) as unknown as T;
    }
    return (await response.text()) as unknown as T;
  } catch (error) {
    throw new FetchKitError('Failed to parse response body', {
      type: 'parse',
      status: response.status,
      statusText: response.statusText,
      config,
      response,
      cause: error,
    });
  }
}
