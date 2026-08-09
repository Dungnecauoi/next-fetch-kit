import type {
  FetchKitConfig,
  FetchKitInstance,
  FetchKitResponse,
  RequestConfig,
  RequestContext,
  FetchKitEventType,
  FetchKitEventHandler,
  FetchKitEventMap,
} from './types';
import { buildRequestContext } from './request';
import { parseResponse } from './response';
import { FetchKitError } from './error';
import { withTimeout } from './timeout';
import { withRetry } from './retry';
import { normalizeRetry, mergeInstanceConfigs } from './merge';
import { createAuthManager, type AuthManager } from './auth';
import { handleAuthRefresh, runRequestHooks, runResponseHooks, runErrorHooks } from './hooks';
import { xhrFetch } from './xhr';

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
  // Event Listeners Map: event -> Set of handlers (typed via FetchKitEventMap)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventListeners = new Map<FetchKitEventType, Set<FetchKitEventHandler<any>>>();

  function emit<K extends FetchKitEventType>(event: K, payload: FetchKitEventMap[K]) {
    const handlers = eventListeners.get(event);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(payload);
        } catch {
          // Prevent listener crashes from corrupting request execution
        }
      });
    }
  }

  // In-flight GET/HEAD request deduplication cache
  const inFlightCache = new Map<string, Promise<FetchKitResponse<any>>>();

  /**
   * Request dispatcher with optional in-flight deduplication.
   */
  function request<T>(
    method: string,
    path: string,
    requestConfig: RequestConfig = {},
    _isAuthRetry = false,
  ): Promise<FetchKitResponse<T>> {
    const methodUpper = method.toUpperCase();
    const isDedupeEnabled = requestConfig.dedupe ?? config.dedupe ?? true;
    const isDedupeable = isDedupeEnabled && (methodUpper === 'GET' || methodUpper === 'HEAD');

    const dedupeKey = isDedupeable
      ? `${methodUpper}:${path}:${JSON.stringify({
          params: requestConfig.query ?? requestConfig.params ?? null,
          cookies: requestConfig.cookies ?? null,
          headers: requestConfig.headers ?? null,
        })}`
      : null;

    if (dedupeKey && inFlightCache.has(dedupeKey)) {
      return inFlightCache.get(dedupeKey) as Promise<FetchKitResponse<T>>;
    }

    const promise = executeRequest<T>(methodUpper, path, requestConfig, _isAuthRetry).finally(
      () => {
        if (dedupeKey) {
          inFlightCache.delete(dedupeKey);
        }
      },
    );

    if (dedupeKey) {
      inFlightCache.set(dedupeKey, promise);
    }

    return promise;
  }

  /**
   * Core request execution pipeline.
   */
  async function executeRequest<T>(
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

      emit('request', context);

      // Step 4: Determine retry config
      const retryConfig =
        requestConfig.retry === false
          ? undefined
          : normalizeRetry(requestConfig.retry) ?? normalizeRetry(config.retry);

      // Step 5: Determine timeout
      const timeout = requestConfig.timeout ?? config.timeout;

      // Step 6: Determine fetch implementation
      const onUploadProgress = requestConfig.onUploadProgress ?? config.onUploadProgress;
      const onDownloadProgress = requestConfig.onDownloadProgress ?? config.onDownloadProgress;

      if ((onUploadProgress || onDownloadProgress) && typeof XMLHttpRequest === 'undefined') {
        if ((globalThis as any).process?.env?.NODE_ENV !== 'production') {
          console.warn(
            '[next-fetch-kit] Warning: "onUploadProgress" / "onDownloadProgress" is configured but running in a Server (SSR) environment where XMLHttpRequest is unavailable. Progress callbacks are disabled on the server.',
          );
        }
      }

      const defaultFetch =
        onUploadProgress || onDownloadProgress
          ? (url: string, init?: RequestInit) =>
              xhrFetch(url, { ...init, onUploadProgress, onDownloadProgress })
          : globalThis.fetch;

      const fetchFn = requestConfig.fetch ?? config.fetch ?? defaultFetch;

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
          emit,
        );
      }

      // Step 9: Parse response
      const response = await parseResponse<T>(rawResponse, context);

      emit('response', response);

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
          emit,
        );
      }

      emit('error', fetchKitError);

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

    on<K extends FetchKitEventType>(event: K, handler: FetchKitEventHandler<K>): () => void {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventListeners.get(event)!.add(handler as FetchKitEventHandler<any>);
      return () => {
        eventListeners.get(event)?.delete(handler as FetchKitEventHandler<any>);
      };
    },

    off<K extends FetchKitEventType>(event: K, handler: FetchKitEventHandler<K>): void {
      eventListeners.get(event)?.delete(handler as FetchKitEventHandler<any>);
    },
  };
  return instance;
}
