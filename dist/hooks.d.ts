import type { FetchKitConfig, FetchKitInstance, FetchKitResponse, RequestConfig, RequestContext, FetchKitEventType, FetchKitEventMap } from './types';
import { FetchKitError } from './error';
import { type AuthManager } from './auth';
export declare function runRequestHooks(hooks: FetchKitConfig['onRequest'], context: RequestContext): Promise<RequestContext>;
export declare function runResponseHooks<T>(hooks: FetchKitConfig['onResponse'], response: FetchKitResponse<T>): Promise<FetchKitResponse<T>>;
export declare function runErrorHooks(hooks: FetchKitConfig['onRequestError'] | FetchKitConfig['onResponseError'] | FetchKitConfig['onError'], error: FetchKitError): Promise<void>;
export declare function handleAuthRefresh<T>(authManager: AuthManager, createRawInstance: () => FetchKitInstance, method: string, path: string, requestConfig: RequestConfig, config: FetchKitConfig, context: RequestContext, emit?: <K extends FetchKitEventType>(event: K, payload: FetchKitEventMap[K]) => void): Promise<FetchKitResponse<T>>;
//# sourceMappingURL=hooks.d.ts.map