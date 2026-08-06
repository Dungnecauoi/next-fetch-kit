# next-fetch-kit

A lightweight, type-safe `fetch` wrapper for **Next.js** — works in both SSR and CSR with built-in auth refresh & cookie forwarding.

[![npm version](https://img.shields.io/npm/v/next-fetch-kit.svg)](https://www.npmjs.com/package/next-fetch-kit)
[![bundle size](https://img.shields.io/bundlephobia/minzip/next-fetch-kit)](https://bundlephobia.com/package/next-fetch-kit)
[![license](https://img.shields.io/npm/l/next-fetch-kit.svg)](https://opensource.org/licenses/MIT)

## Why next-fetch-kit?

| Feature | next-fetch-kit | axios | ky | ofetch |
|:---|:---|:---|:---|:---|
| SSR + CSR | ✅ | ❌ | ✅ | ✅ |
| Next.js `revalidate/tags` | ✅ | ❌ | ❌ | ❌ |
| Cookie forwarding (SSR) | ✅ | ❌ | ❌ | ❌ |
| Auto refresh token (401) | ✅ | ❌ | ❌ | ❌ |
| Auto retry | ✅ | ❌ | ✅ | ✅ |
| Timeout | ✅ | ✅ | ✅ | ⚠️ |
| Bundle size | ~3.5KB | ~13KB | ~4KB | ~6KB |
| Zero dependencies | ✅ | ❌ | ✅ | ✅ |

## Install

### From GitHub (Recommended)

```bash
# npm
npm install Dungnecauoi/next-fetch-kit

# pnpm
pnpm add Dungnecauoi/next-fetch-kit

# yarn
yarn add Dungnecauoi/next-fetch-kit

# bun
bun add Dungnecauoi/next-fetch-kit
```

Or via full Git HTTPS URL:
```bash
npm install git+https://github.com/Dungnecauoi/next-fetch-kit.git
```

### From npm Registry

```bash
npm install next-fetch-kit
```

## Quick Start

```typescript
import { createFetchKit } from 'next-fetch-kit';

const api = createFetchKit({
  baseURL: 'https://api.example.com',
  credentials: 'include',
  timeout: 10000,
});

// GET
const { data, status } = await api.get<User[]>('/users');

// POST
const { data } = await api.post<User>('/users', {
  body: { name: 'John', email: 'john@example.com' },
});

// PUT, PATCH, DELETE
await api.put<User>('/users/1', { body: { name: 'Jane' } });
await api.patch<User>('/users/1', { body: { name: 'Jane' } });
await api.delete('/users/1');
```

## Features

### Next.js Cache Integration

```typescript
// ISR — revalidate every 60 seconds
const { data } = await api.get<Product[]>('/products', {
  next: { revalidate: 60, tags: ['products'] },
});

// No cache
const { data } = await api.get<User>('/me', {
  cache: 'no-store',
});

// Force cache
const { data } = await api.get<Config>('/config', {
  cache: 'force-cache',
});
```

### Auto Retry

```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  retry: { count: 3, delay: 1000, backoff: true },
  // Or simply: retry: 3
});
```

By default, only idempotent methods (GET, HEAD, OPTIONS) are retried on 408, 429, 500, 502, 503, 504.

### Timeout

```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  timeout: 10000, // 10 seconds
});

// Per-request override
await api.get('/slow', { timeout: 30000 });
```

### Query Params

```typescript
// GET /users?page=1&limit=20&sort=name
await api.get('/users', {
  params: { page: 1, limit: 20, sort: 'name' },
});

// Nested: GET /search?filter[status]=active&filter[role]=admin
await api.get('/search', {
  params: { filter: { status: 'active', role: 'admin' } },
});
```

### Interceptors (Hooks)

```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',

  onRequest(config) {
    config.headers.set('X-Request-Id', crypto.randomUUID());
    return config;
  },

  onResponse(response) {
    console.log(`[${response.status}] ${response.raw.url}`);
    return response;
  },

  onRequestError(error) {
    console.error('Network error:', error.message);
  },

  onResponseError(error) {
    if (error.status === 403) {
      console.error('Forbidden!');
    }
  },
});
```

### Cookie Forwarding (SSR)

In Next.js Server Components, `fetch` doesn't automatically include browser cookies. `next-fetch-kit` solves this:

**Option A: Auto-forward**
```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  credentials: 'include',
  forwardCookies: true, // Auto-reads cookies() from next/headers in SSR
});

// Server Component — cookies are automatically forwarded
export default async function Page() {
  const { data } = await api.get<User>('/me');
  return <div>{data.name}</div>;
}
```

**Option B: Per-request**
```typescript
import { cookies } from 'next/headers';

export default async function Page() {
  const cookieStore = await cookies();
  const { data } = await api.get<User>('/me', {
    cookies: cookieStore,
  });
  return <div>{data.name}</div>;
}
```

### Auto Refresh Token (401)

Automatically refreshes expired tokens with a queue mechanism to prevent race conditions.

**Header-based auth (Authorization header):**
```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  auth: {
    getToken: () => localStorage.getItem('accessToken'),

    refresh: async (kit) => {
      const { data } = await kit.post<{ accessToken: string }>('/auth/refresh', {
        body: { refreshToken: localStorage.getItem('refreshToken') },
      });
      return data.accessToken;
    },

    onRefreshed: (newToken) => {
      localStorage.setItem('accessToken', newToken);
    },

    onRefreshFailed: () => {
      localStorage.clear();
      window.location.href = '/login';
    },
  },
});
```

**Cookie-based auth (httpOnly cookies):**
```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  credentials: 'include',
  auth: {
    refresh: async (kit) => {
      await kit.post('/auth/refresh');
      // No return — server sets new httpOnly cookie automatically
    },
    onRefreshFailed: () => {
      window.location.href = '/login';
    },
  },
});
```

**How the queue works:**
```
Request A → 401
  ├── Start refreshing (lock)
  ├── Request B → 401 → queued
  ├── Request C → 401 → queued
  ├── Refresh succeeds → unlock
  │   ├── Retry A with new token ✅
  │   ├── Retry B with new token ✅
  │   └── Retry C with new token ✅
```

### Extend Instance

```typescript
const baseApi = createFetchKit({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

// Inherit all config + add Authorization header
const authApi = baseApi.extend({
  headers: { Authorization: `Bearer ${token}` },
});

// Inherit all config + change baseURL
const adminApi = baseApi.extend({
  baseURL: 'https://admin.example.com',
});
```

### Upload Files

```typescript
const formData = new FormData();
formData.append('file', file);

const { data } = await api.post<MediaResponse>('/upload', {
  body: formData, // Content-Type auto-detected
});
```

### Abort Requests

```typescript
const controller = new AbortController();

const promise = api.get('/slow', {
  signal: controller.signal,
});

// Cancel anytime
controller.abort();
```

## Error Handling

All errors are instances of `FetchKitError` with helpful properties:

```typescript
import { FetchKitError } from 'next-fetch-kit';

try {
  await api.get('/endpoint');
} catch (error) {
  if (error instanceof FetchKitError) {
    error.type;       // 'http' | 'network' | 'timeout' | 'abort' | 'parse'
    error.status;     // 404, 500, etc.
    error.data;       // Parsed response body
    error.message;    // Human-readable message

    // Helper methods
    error.isHttpError();    // true for 4xx/5xx
    error.isTimeout();      // true for timeouts
    error.isNetworkError(); // true for network failures
    error.isAbort();        // true for aborted requests
  }
}
```

## API Reference

### `createFetchKit(config)`

| Option | Type | Default | Description |
|:---|:---|:---|:---|
| `baseURL` | `string` | `''` | Base URL for all requests |
| `headers` | `HeadersInit` | `{}` | Default headers |
| `credentials` | `RequestCredentials` | - | Credentials mode |
| `timeout` | `number` | - | Timeout in ms |
| `retry` | `RetryConfig \| number` | - | Retry configuration |
| `next` | `NextOptions` | - | Next.js cache options |
| `cache` | `RequestCache` | - | Cache mode |
| `forwardCookies` | `boolean` | `false` | Auto-forward cookies in SSR |
| `auth` | `AuthConfig` | - | Auth & refresh config |
| `onRequest` | `Function` | - | Before-request hook |
| `onResponse` | `Function` | - | After-response hook |
| `onRequestError` | `Function` | - | Network error hook |
| `onResponseError` | `Function` | - | HTTP error hook |

### Instance Methods

```typescript
api.get<T>(path, config?)     → Promise<FetchKitResponse<T>>
api.post<T>(path, config?)    → Promise<FetchKitResponse<T>>
api.put<T>(path, config?)     → Promise<FetchKitResponse<T>>
api.patch<T>(path, config?)   → Promise<FetchKitResponse<T>>
api.delete<T>(path, config?)  → Promise<FetchKitResponse<T>>
api.head<T>(path, config?)    → Promise<FetchKitResponse<T>>
api.options<T>(path, config?) → Promise<FetchKitResponse<T>>
api.extend(overrides)         → FetchKitInstance
```

### `FetchKitResponse<T>`

```typescript
{
  data: T;           // Parsed response body
  status: number;    // HTTP status code
  statusText: string;
  headers: Headers;
  raw: Response;     // Original Response object
}
```

## License

MIT
