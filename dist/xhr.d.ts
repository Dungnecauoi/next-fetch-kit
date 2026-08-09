import type { ProgressCallback } from './types';
export interface XHRFetchInit extends RequestInit {
    onUploadProgress?: ProgressCallback;
    onDownloadProgress?: ProgressCallback;
}
/**
 * Fetch adapter powered by XMLHttpRequest.
 * Used when onUploadProgress or onDownloadProgress is configured in a browser environment.
 */
export declare function xhrFetch(url: string, init?: XHRFetchInit): Promise<Response>;
//# sourceMappingURL=xhr.d.ts.map