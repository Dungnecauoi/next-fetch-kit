// ============================================================================
// next-fetch-kit — Auth & Token Refresh
// ============================================================================

import type { AuthConfig, FetchKitInstance, RequestContext } from './types';

/**
 * Internal state for the refresh token queue mechanism.
 */
interface AuthState {
  isRefreshing: boolean;
  refreshPromise: Promise<string | void> | null;
  /** Queue of requests waiting for refresh to complete */
  failedQueue: Array<{
    resolve: (token: string | void) => void;
    reject: (error: unknown) => void;
  }>;
}

/**
 * Create an auth manager that handles:
 * - Attaching tokens to requests via getToken()
 * - Auto-refreshing tokens on 401 responses
 * - Queue mechanism to prevent multiple simultaneous refresh calls
 * - Anti-loop protection (refresh endpoint 401 doesn't trigger another refresh)
 */
export function createAuthManager(authConfig: AuthConfig) {
  const state: AuthState = {
    isRefreshing: false,
    refreshPromise: null,
    failedQueue: [],
  };

  return {
    /**
     * Apply the auth token to a request's headers.
     * Called in the request pipeline before sending.
     */
    async applyToken(headers: Headers): Promise<void> {
      if (!authConfig.getToken) return;

      const token = await authConfig.getToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    },

    /**
     * Handle a 401 response by attempting to refresh the token.
     *
     * Returns:
     * - `string` — new token (header-based auth), caller should retry
     * - `undefined` — cookie-based auth, caller should retry (cookie auto-set)
     * - throws — refresh failed, caller should propagate error
     */
    async handleUnauthorized(
      rawInstance: FetchKitInstance,
      _config?: RequestContext,
    ): Promise<string | void> {
      if (!authConfig.refresh) {
        // No refresh configured — just throw the 401
        return Promise.reject(new Error('Unauthorized (401) — no refresh handler configured'));
      }

      // If already refreshing, queue this request
      if (state.isRefreshing) {
        return new Promise<string | void>((resolve, reject) => {
          state.failedQueue.push({ resolve, reject });
        });
      }

      // Start refreshing
      state.isRefreshing = true;

      try {
        const result = await authConfig.refresh(rawInstance);

        // Notify onRefreshed callback
        if (result && authConfig.onRefreshed) {
          await authConfig.onRefreshed(result);
        }

        // Resolve all queued requests
        processQueue(state, null, result);

        return result;
      } catch (error) {
        // Reject all queued requests
        processQueue(state, error, undefined);

        // Notify onRefreshFailed callback
        if (authConfig.onRefreshFailed) {
          await authConfig.onRefreshFailed(error);
        }

        throw error;
      } finally {
        state.isRefreshing = false;
        state.refreshPromise = null;
      }
    },

    /**
     * Check if refresh is configured.
     */
    hasRefresh(): boolean {
      return typeof authConfig.refresh === 'function';
    },

    /**
     * Reset internal state (useful for testing).
     */
    reset(): void {
      state.isRefreshing = false;
      state.refreshPromise = null;
      state.failedQueue = [];
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function processQueue(
  state: AuthState,
  error: unknown,
  token: string | void | undefined,
): void {
  for (const pending of state.failedQueue) {
    if (error) {
      pending.reject(error);
    } else {
      pending.resolve(token as string | void);
    }
  }
  state.failedQueue = [];
}

/** Type for the auth manager */
export type AuthManager = ReturnType<typeof createAuthManager>;
