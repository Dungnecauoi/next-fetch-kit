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
   */
  async function request<T>(
    method: string,
    path: string,
    requestConfig: RequestConfig = {},
  ): Promise<FetchKitResponse<T>> {
    // Step 1: Build request context
    let context = await buildRequestContext(method, path, config, requestConfig);

    // Step 2: Apply auth token
    if (authManager) {
      await authManager.applyToken(context.headers);
    }

    // Step 3: Run onRequest hook
    if (config.onRequest) {
      context = await config.onRequest(context);
    }

    // Step 4: Determine retry config
    const retryConfig =
      requestConfig.retry === false
        ? undefined
        : normalizeRetry(requestConfig.retry) ?? normalizeRetry(config.retry);

    // Step 5: Determine timeout
    const timeout = requestConfig.timeout ?? config.timeout;

    try {
      // Step 6: Execute with retry → timeout → fetch pipeline
      const rawResponse = await withRetry(
        () =>
          withTimeout(
            (signal) => fetch(context.url, { ...context.init, signal }),
            timeout,
            requestConfig.signal,
            context,
          ),
        retryConfig,
        method,
        context,
      );

      // Step 7: Check for 401 and attempt auth refresh
      if (rawResponse.status === 401 && authManager?.hasRefresh() && createRawInstance) {
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

      // Step 8: Parse response
      const response = await parseResponse<T>(rawResponse, context);

      // Step 9: Run onResponse hook
      if (config.onResponse) {
        const modified = await config.onResponse(response as FetchKitResponse<unknown>);
        if (modified) {
          return modified as FetchKitResponse<T>;
        }
      }

      return response;
    } catch (error) {
      const fetchKitError = FetchKitError.from(error, context);

      // Handle 401 from error path (e.g., after parse throws HTTP error)
      if (
        fetchKitError.isHttpError() &&
        fetchKitError.status === 401 &&
        authManager?.hasRefresh() &&
        createRawInstance
      ) {
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
        await config.onResponseError(fetchKitError);
      } else if (!fetchKitError.isHttpError() && config.onRequestError) {
        await config.onRequestError(fetchKitError);
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
  try {
    const rawInstance = createRawInstance();
    const newToken = await authManager.handleUnauthorized(rawInstance, context);

    // Retry the original request
    // For header-based auth: the new token will be applied by getToken() on retry
    // For cookie-based auth: the cookie is already set by the refresh response
    const retryConfig = { ...requestConfig };

    // Disable retry for the retried request to prevent infinite loops
    retryConfig.retry = false;

    // Re-execute through the same pipeline (will call getToken() again for new token)
    const retryContext = await buildRequestContext(method, path, config, retryConfig);

    // Apply new token manually if header-based
    if (newToken) {
      retryContext.headers.set('Authorization', `Bearer ${newToken}`);
    } else {
      // Cookie-based: re-apply token from getToken (which should now return fresh data)
      await authManager.applyToken(retryContext.headers);
    }

    const rawResponse = await fetch(retryContext.url, retryContext.init);
    return await parseResponse<T>(rawResponse, retryContext);
  } catch (refreshError) {
    // Run error hooks for the original 401
    const fetchKitError = FetchKitError.from(refreshError, context);
    if (config.onResponseError) {
      await config.onResponseError(fetchKitError);
    }
    throw fetchKitError;
  }
}
