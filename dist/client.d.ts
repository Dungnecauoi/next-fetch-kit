import type { FetchKitConfig, FetchKitInstance } from './types';
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
export declare function createFetchKit(config?: FetchKitConfig): FetchKitInstance;
//# sourceMappingURL=client.d.ts.map