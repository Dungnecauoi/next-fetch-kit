// ============================================================================
// next-fetch-kit — Public API
// ============================================================================

export { createFetchKit } from './client';
export { FetchKitError, isFetchKitError } from './error';

export type {
  FetchKitConfig,
  FetchKitInstance,
  FetchKitResponse,
  RequestConfig,
  RequestContext,
  RetryConfig,
  NextOptions,
  AuthConfig,
  CookieStore,
  FetchKitErrorType,
  InterceptorHooks,
} from './types';
