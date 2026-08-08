// ============================================================================
// next-fetch-kit — Hook Runners & Auth Refresh Handler
// ============================================================================

import type {
  FetchKitConfig,
  FetchKitInstance,
  FetchKitResponse,
  RequestConfig,
  RequestContext,
  FetchKitEventType,
  FetchKitEventMap,
} from './types';
import { buildRequestContext } from './request';
import { parseResponse } from './response';
import { FetchKitError } from './error';
import { withTimeout } from './timeout';
import { type AuthManager } from './auth';

// ---------------------------------------------------------------------------
// Hook Execution Helpers (Support single function or array of functions)
// ---------------------------------------------------------------------------

export async function runRequestHooks(
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

export async function runResponseHooks<T>(
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

export async function runErrorHooks(
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

// ---------------------------------------------------------------------------
// Auth Refresh Handler
// ---------------------------------------------------------------------------

export async function handleAuthRefresh<T>(
  authManager: AuthManager,
  createRawInstance: () => FetchKitInstance,
  method: string,
  path: string,
  requestConfig: RequestConfig,
  config: FetchKitConfig,
  context: RequestContext,
  emit?: <K extends FetchKitEventType>(event: K, payload: FetchKitEventMap[K]) => void,
): Promise<FetchKitResponse<T>> {
  let retryContext: RequestContext | undefined;
  try {
    const rawInstance = createRawInstance();
    const newToken = await authManager.handleUnauthorized(rawInstance, context);

    if (emit) {
      emit('auth:refreshed', newToken);
    }

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
    if (emit) {
      emit('auth:refresh-failed', refreshError);
    }
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
