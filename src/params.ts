// ============================================================================
// next-fetch-kit — Query String Serializer
// ============================================================================

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
export function serializeParams(params: Record<string, unknown>): string {
  const parts: string[] = [];
  buildParams('', params, parts);
  return parts.join('&');
}

/**
 * Append serialized query params to a URL.
 * Handles URLs that already have query parameters.
 */
export function appendParams(url: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) {
    return url;
  }

  const serialized = serializeParams(params);
  if (!serialized) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${serialized}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildParams(prefix: string, value: unknown, parts: string[]): void {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const key = prefix ? `${prefix}[${i}]` : String(i);
      buildParams(key, value[i], parts);
    }
  } else if (typeof value === 'object' && !(value instanceof Date)) {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const nestedKey = prefix ? `${prefix}[${key}]` : key;
      buildParams(nestedKey, obj[key], parts);
    }
  } else {
    const encoded = encodeURIComponent(
      value instanceof Date ? value.toISOString() : String(value),
    );
    parts.push(`${encodeURIComponent(prefix)}=${encoded}`);
  }
}
