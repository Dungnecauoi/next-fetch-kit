import type { AuthConfig, FetchKitInstance, RequestContext } from './types';
/**
 * Create an auth manager that handles:
 * - Attaching tokens to requests via getToken()
 * - Auto-refreshing tokens on 401 responses
 * - Queue mechanism to prevent multiple simultaneous refresh calls
 * - Anti-loop protection (refresh endpoint 401 doesn't trigger another refresh)
 */
export declare function createAuthManager(authConfig: AuthConfig): {
    /**
     * Apply the auth token to a request's headers.
     * Called in the request pipeline before sending.
     */
    applyToken(headers: Headers): Promise<void>;
    /**
     * Handle a 401 response by attempting to refresh the token.
     *
     * Returns:
     * - `string` — new token (header-based auth), caller should retry
     * - `undefined` — cookie-based auth, caller should retry (cookie auto-set)
     * - throws — refresh failed, caller should propagate error
     */
    handleUnauthorized(rawInstance: FetchKitInstance, _config?: RequestContext): Promise<string | void>;
    /**
     * Check if refresh is configured.
     */
    hasRefresh(): boolean;
    /**
     * Reset internal state (useful for testing).
     */
    reset(): void;
};
/** Type for the auth manager */
export type AuthManager = ReturnType<typeof createAuthManager>;
//# sourceMappingURL=auth.d.ts.map