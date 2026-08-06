/**
 * Serialize an object into a URL query string.
 *
 * Features:
 * - Supports nested objects: `{ filter: { status: 'active' } }` → `filter[status]=active`
 * - Supports arrays: `{ ids: [1, 2] }` → `ids[0]=1&ids[1]=2`
 * - Skips `undefined` and `null` values
 * - Encodes special characters
 *
 * @param params - Object to serialize
 * @returns Encoded query string (without leading '?')
 */
export declare function serializeParams(params: Record<string, unknown>): string;
/**
 * Append serialized query params to a URL.
 * Handles URLs that already have query parameters.
 */
export declare function appendParams(url: string, params?: Record<string, unknown>): string;
//# sourceMappingURL=params.d.ts.map