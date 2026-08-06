// ============================================================================
// next-fetch-kit — Config Merger
// ============================================================================

import type { FetchKitConfig, RequestConfig, RetryConfig, NextOptions } from './types';

/**
 * Normalize a RetryConfig from the shorthand (number) or full object form.
 */
export function normalizeRetry(
  retry: RetryConfig | number | false | undefined,
): RetryConfig | undefined {
  if (retry === false || retry === undefined) {
    return undefined;
  }
  if (typeof retry === 'number') {
    return { count: retry };
  }
  return retry;
}

/**
 * Merge two header sources into a single Headers object.
 * Later values override earlier ones for the same key.
 */
export function mergeHeaders(
  base?: HeadersInit | Record<string, string>,
  override?: HeadersInit | Record<string, string>,
): Headers {
  const merged = new Headers();

  applyHeaders(merged, base);
  applyHeaders(merged, override);

  return merged;
}

/**
 * Merge two NextOptions objects. Override values take precedence.
 * Tags arrays are concatenated (deduplicated).
 */
export function mergeNextOptions(
  base?: NextOptions,
  override?: NextOptions,
): NextOptions | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;

  const merged: NextOptions = { ...base, ...override };

  // Merge tags: concatenate and deduplicate
  if (base.tags || override.tags) {
    const tags = [...(base.tags || []), ...(override.tags || [])];
    merged.tags = [...new Set(tags)];
  }

  return merged;
}

/**
 * Deep merge instance config with per-request config to produce
 * the final resolved configuration for a single request.
 */
export function mergeConfigs(
  instanceConfig: FetchKitConfig,
  requestConfig: RequestConfig,
): {
  headers: Headers;
  credentials: RequestCredentials | undefined;
  timeout: number | undefined;
  retry: RetryConfig | undefined;
  next: NextOptions | undefined;
  cache: RequestCache | undefined;
} {
  return {
    headers: mergeHeaders(instanceConfig.headers, requestConfig.headers),
    credentials: requestConfig.credentials ?? instanceConfig.credentials,
    timeout: requestConfig.timeout ?? instanceConfig.timeout,
    retry:
      requestConfig.retry === false
        ? undefined
        : normalizeRetry(requestConfig.retry) ??
          normalizeRetry(instanceConfig.retry),
    next: mergeNextOptions(instanceConfig.next, requestConfig.next),
    cache: requestConfig.cache ?? instanceConfig.cache,
  };
}

/**
 * Merge two FetchKitConfig objects (for instance.extend()).
 * Hooks from override replace base hooks (not chained).
 */
export function mergeInstanceConfigs(
  base: FetchKitConfig,
  override: Partial<FetchKitConfig>,
): FetchKitConfig {
  return {
    ...base,
    ...override,
    headers: mergeHeaders(base.headers, override.headers)
      ? Object.fromEntries(mergeHeaders(base.headers, override.headers))
      : undefined,
    next: mergeNextOptions(base.next, override.next),
    retry: override.retry !== undefined ? override.retry : base.retry,
    auth: override.auth !== undefined ? { ...base.auth, ...override.auth } : base.auth,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function applyHeaders(target: Headers, source?: HeadersInit | Record<string, string>): void {
  if (!source) return;

  if (source instanceof Headers) {
    source.forEach((value, key) => target.set(key, value));
  } else if (Array.isArray(source)) {
    for (const [key, value] of source) {
      target.set(key, value);
    }
  } else {
    for (const [key, value] of Object.entries(source)) {
      target.set(key, value);
    }
  }
}
