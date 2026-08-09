// ============================================================================
// next-fetch-kit — XMLHttpRequest Fetch Adapter for Upload/Download Progress
// ============================================================================

import type { ProgressCallback } from './types';

export interface XHRFetchInit extends RequestInit {
  onUploadProgress?: ProgressCallback;
  onDownloadProgress?: ProgressCallback;
}

/**
 * Fetch adapter powered by XMLHttpRequest.
 * Used when onUploadProgress or onDownloadProgress is configured in a browser environment.
 */
export function xhrFetch(url: string, init?: XHRFetchInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === 'undefined') {
      const { onUploadProgress, onDownloadProgress, ...standardInit } = init || {};
      return resolve(globalThis.fetch(url, standardInit));
    }

    const xhr = new XMLHttpRequest();
    const method = (init?.method || 'GET').toUpperCase();

    xhr.open(method, url, true);

    // Credentials
    if (init?.credentials === 'include') {
      xhr.withCredentials = true;
    } else if (init?.credentials === 'omit') {
      xhr.withCredentials = false;
    }

    // Set headers
    if (init?.headers) {
      const headers = new Headers(init.headers);
      headers.forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
    }

    const startTime = Date.now();

    // Upload Progress
    if (init?.onUploadProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        const total = e.lengthComputable ? e.total : 0;
        const loaded = e.loaded;
        const percentage = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
        const duration = (Date.now() - startTime) / 1000;
        const rate = duration > 0 ? Math.round(loaded / duration) : 0;
        const estimated = rate > 0 && total > 0 ? Math.round((total - loaded) / rate) : undefined;

        init.onUploadProgress!({
          loaded,
          total,
          percentage,
          rate,
          estimated,
        });
      };
    }

    // Download Progress
    if (init?.onDownloadProgress) {
      xhr.onprogress = (e) => {
        const total = e.lengthComputable ? e.total : 0;
        const loaded = e.loaded;
        const percentage = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
        const duration = (Date.now() - startTime) / 1000;
        const rate = duration > 0 ? Math.round(loaded / duration) : 0;
        const estimated = rate > 0 && total > 0 ? Math.round((total - loaded) / rate) : undefined;

        init.onDownloadProgress!({
          loaded,
          total,
          percentage,
          rate,
          estimated,
        });
      };
    }

    // Signal / Abort
    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };

    if (init?.signal) {
      if (init.signal.aborted) {
        onAbort();
        return;
      }
      init.signal.addEventListener('abort', onAbort, { once: true });
    }

    // ArrayBuffer response type so we can reconstruct Response object
    xhr.responseType = 'arraybuffer';

    xhr.onload = () => {
      if (init?.signal) {
        init.signal.removeEventListener('abort', onAbort);
      }

      // Reconstruct Response headers
      const rawHeaders = xhr.getAllResponseHeaders();
      const responseHeaders = new Headers();
      if (rawHeaders) {
        rawHeaders
          .trim()
          .split(/[\r\n]+/)
          .forEach((line) => {
            const parts = line.split(': ');
            const header = parts.shift();
            const value = parts.join(': ');
            if (header) {
              responseHeaders.append(header, value);
            }
          });
      }

      const response = new Response(xhr.response, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: responseHeaders,
      });

      resolve(response);
    };

    xhr.onerror = () => {
      if (init?.signal) {
        init.signal.removeEventListener('abort', onAbort);
      }
      reject(new TypeError('Network request failed'));
    };

    xhr.ontimeout = () => {
      if (init?.signal) {
        init.signal.removeEventListener('abort', onAbort);
      }
      reject(new TypeError('Request timed out'));
    };

    // Body
    xhr.send((init?.body as XMLHttpRequestBodyInit) || null);
  });
}
