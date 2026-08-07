// ============================================================================
// next-fetch-kit — Core Client Factory
// ============================================================================

import type {
  FetchKitConfig,
  FetchKitInstance,
  FetchKitResponse,
  RequestConfig,
  RequestContext,
} from './types';
import { buildRequestContext } from './request';
import { parseResponse } from './response';
import { FetchKitError } from './error';
import { withTimeout } from './timeout';
import { withRetry } from './retry';
import { normalizeRetry, mergeInstanceConfigs } from './merge';
import { createAuthManager, type AuthManager } from './auth';

/**
 * Create a FetchKit instance with the given configuration.
 *
 * @example
 * ```typescript
 * const api = createFetchKit({
 *   baseURL: 'https://api.example.com',
 *   credentials: 'include',
 *   timeout: 10000,
 *   retry: { count: 3, delay: 1000 },
 *   auth: {
 *     getToken: () => localStorage.getItem('token'),
 *     refresh: async (kit) => {
 *       const { data } = await kit.post('/auth/refresh');
 *       return data.accessToken;
 *     },
 *   },
 * });
 *
 * const { data } = await api.get<User[]>('/users');
 * ```
 */
export function createFetchKit(config: FetchKitConfig = {}): FetchKitInstance {
  // Create auth manager if auth config is provided
  const authManager = config.auth ? createAuthManager(config.auth) : undefined;

  // Create a raw instance (without auth interceptors) for refresh calls
  // This prevents refresh loops: refresh endpoint 401 → won't trigger another refresh
  const createRawInstance = (): FetchKitInstance => {
    const rawConfig = { ...config, auth: undefined };
    return createInstanceMethods(rawConfig, undefined);
  };

  return createInstanceMethods(config, authManager, createRawInstance);
}

// ---------------------------------------------------------------------------
// Internal: Build the instance methods
// ---------------------------------------------------------------------------

function createInstanceMethods(
  config: FetchKitConfig,
  authManager: AuthManager | undefined,
  createRawInstance?: () => FetchKitInstance,
): FetchKitInstance {
  /**
   * Core request execution pipeline.
   *
   * @param _isAuthRetry - Internal flag to prevent infinite auth refresh loops.
   *   NOT exposed in public RequestConfig to prevent user tampering (BUG-1 fix).
   */
  async function request<T>(
    method: string,
    path: string,
    requestConfig: RequestConfig = {},
    _isAuthRetry = false,
  ): Promise<FetchKitResponse<T>> {
    let context: RequestContext | undefined;
    let authRefreshAttempted = _isAuthRetry;

    try {
      // Step 1: Build request context
      context = await buildRequestContext(method, path, config, requestConfig);

      // Step 2: Apply auth token
      if (authManager) {
        await authManager.applyToken(context.headers);
      }

      // Step 3: Run onRequest hooks
      if (config.onRequest) {
        context = await runRequestHooks(config.onRequest, context);
      }

      // Step 4: Determine retry config
      const retryConfig =
        requestConfig.retry === false
          ? undefined
          : normalizeRetry(requestConfig.retry) ?? normalizeRetry(config.retry);

      // Step 5: Determine timeout
      const timeout = requestConfig.timeout ?? config.timeout;

      // Step 6: Determine fetch implementation
      const fetchFn = requestConfig.fetch ?? config.fetch ?? globalThis.fetch;

      // Step 7: Execute with retry → timeout → fetch pipeline
      const rawResponse = await withRetry(
        () =>
          withTimeout(
            (signal) => fetchFn(context!.url, { ...context!.init, signal }),
            timeout,
            requestConfig.signal,
            context,
          ),
        retryConfig,
        method,
        context,
      );

      // Step 8: Check for 401 and attempt auth refresh (only once per request)
      if (
        rawResponse.status === 401 &&
        !authRefreshAttempted &&
        authManager?.hasRefresh() &&
        createRawInstance
      ) {
        authRefreshAttempted = true;
        return await handleAuthRefresh<T>(
          authManager,
          createRawInstance,
          method,
          path,
          requestConfig,
          config,
          context,
        );
      }

      // Step 9: Parse response
      const response = await parseResponse<T>(rawResponse, context);

      // Step 10: Run onResponse hooks
      if (config.onResponse) {
        return await runResponseHooks<T>(config.onResponse, response);
      }

      return response;
    } catch (error) {
      const fetchKitError = FetchKitError.from(error, context);

      // Handle 401 from error path (e.g., after parse throws HTTP error)
      if (
        fetchKitError.isHttpError() &&
        fetchKitError.status === 401 &&
        context &&
        !authRefreshAttempted &&
        authManager?.hasRefresh() &&
        createRawInstance
      ) {
        authRefreshAttempted = true;
        return await handleAuthRefresh<T>(
          authManager,
          createRawInstance,
          method,
          path,
          requestConfig,
          config,
          context,
        );
      }

      // Run error hooks
      if (fetchKitError.isHttpError() && config.onResponseError) {
        await runErrorHooks(config.onResponseError, fetchKitError);
      } else if (!fetchKitError.isHttpError() && config.onRequestError) {
        await runErrorHooks(config.onRequestError, fetchKitError);
      }

      // Run universal onError hook if configured
      if (config.onError) {
        await runErrorHooks(config.onError, fetchKitError);
      }

      throw fetchKitError;
    }
  }

  const instance: FetchKitInstance = {
    get: <T>(path: string, cfg?: RequestConfig) => request<T>('GET', path, cfg),
    post: <T>(path: string, cfg?: RequestConfig) => request<T>('POST', path, cfg),
    put: <T>(path: string, cfg?: RequestConfig) => request<T>('PUT', path, cfg),
    patch: <T>(path: string, cfg?: RequestConfig) => request<T>('PATCH', path, cfg),
    delete: <T>(path: string, cfg?: RequestConfig) => request<T>('DELETE', path, cfg),
    head: <T>(path: string, cfg?: RequestConfig) => request<T>('HEAD', path, cfg),
    options: <T>(path: string, cfg?: RequestConfig) => request<T>('OPTIONS', path, cfg),

    extend(overrides: Partial<FetchKitConfig>): FetchKitInstance {
      const mergedConfig = mergeInstanceConfigs(config, overrides);
      return createFetchKit(mergedConfig);
    },
  };

  return instance;
}

// ---------------------------------------------------------------------------
// Auth refresh handler
// ---------------------------------------------------------------------------

async function handleAuthRefresh<T>(
  authManager: AuthManager,
  createRawInstance: () => FetchKitInstance,
  method: string,
  path: string,
  requestConfig: RequestConfig,
  config: FetchKitConfig,
  context: RequestContext,
): Promise<FetchKitResponse<T>> {
  let retryContext: RequestContext | undefined;
  try {
    const rawInstance = createRawInstance();
    const newToken = await authManager.handleUnauthorized(rawInstance, context);

    // Retry the original request — disable retry to prevent double-retry
    const retryRequestConfig: RequestConfig = {
      ...requestConfig,
      retry: false,
    };

    // Re-build request context for the retry
    retryContext = await buildRequestContext(method, path, config, retryRequestConfig);

    // Apply new token manually if header-based
    if (newToken) {
      retryContext.headers.set('Authorization', `Bearer ${newToken}`);
    } else {
      // Cookie-based: re-apply token from getToken (which should now return fresh data)
      await authManager.applyToken(retryContext.headers);
    }

    // Run onRequest hook on the retry context
    if (config.onRequest) {
      retryContext = await runRequestHooks(config.onRequest, retryContext);
    }

    // Wrap retry fetch with timeout protection and custom fetch
    const timeout = requestConfig.timeout ?? config.timeout;
    const fetchFn = requestConfig.fetch ?? config.fetch ?? globalThis.fetch;

    const rawResponse = await withTimeout(
      (signal) => fetchFn(retryContext!.url, { ...retryContext!.init, signal }),
      timeout,
      requestConfig.signal,
      retryContext,
    );

    // Parse the retry response
    const response = await parseResponse<T>(rawResponse, retryContext);

    // Run onResponse hook on the retry response
    if (config.onResponse) {
      return await runResponseHooks<T>(config.onResponse, response);
    }

    return response;
  } catch (refreshError) {
    // Run error hooks for the failed retry
    const errContext = retryContext ?? context;
    const fetchKitError = FetchKitError.from(refreshError, errContext);
    if (fetchKitError.isHttpError() && config.onResponseError) {
      await runErrorHooks(config.onResponseError, fetchKitError);
    } else if (!fetchKitError.isHttpError() && config.onRequestError) {
      await runErrorHooks(config.onRequestError, fetchKitError);
    }
    if (config.onError) {
      await runErrorHooks(config.onError, fetchKitError);
    }
    throw fetchKitError;
  }
}

// ---------------------------------------------------------------------------
// Hook Execution Helpers (Support single function or array of functions)
// ---------------------------------------------------------------------------

async function runRequestHooks(
  hooks: FetchKitConfig['onRequest'],
  context: RequestContext,
): Promise<RequestContext> {
  if (!hooks) return context;
  const list = Array.isArray(hooks) ? hooks : [hooks];
  let current = context;
  for (const fn of list) {
    const next = await fn(current);
    if (next) current = next;
  }
  return current;
}

async function runResponseHooks<T>(
  hooks: FetchKitConfig['onResponse'],
  response: FetchKitResponse<T>,
): Promise<FetchKitResponse<T>> {
  if (!hooks) return response;
  const list = Array.isArray(hooks) ? hooks : [hooks];
  let current = response as FetchKitResponse<unknown>;
  for (const fn of list) {
    const next = await fn(current);
    if (next) current = next;
  }
  return current as FetchKitResponse<T>;
}

async function runErrorHooks(
  hooks:
    | FetchKitConfig['onRequestError']
    | FetchKitConfig['onResponseError']
    | FetchKitConfig['onError'],
  error: FetchKitError,
): Promise<void> {
  if (!hooks) return;
  const list = Array.isArray(hooks) ? hooks : [hooks];
  for (const fn of list) {
    await fn(error);
  }
}

