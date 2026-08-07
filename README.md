# next-fetch-kit

A lightweight (~4.5KB gzipped), type-safe `fetch` wrapper for **Next.js** — designed for seamless operation in both **SSR (Server Components, Route Handlers, Middleware)** and **CSR (Client Components)** with built-in auth refresh queue, request deduplication, event bus, and SSR cookie forwarding.

[![license](https://img.shields.io/github/license/Dungnecauoi/next-fetch-kit.svg)](https://opensource.org/licenses/MIT)

---

## ⚡ Why next-fetch-kit?

- **SSR + CSR Native**: Full compatibility with Next.js App Router (Server Components & Client Components).
- **In-flight Request Deduplication**: Merges simultaneous identical `GET`/`HEAD` requests across React components into 1 network call.
- **Next.js Revalidation & Cache**: Native `revalidate`, `tags`, and `cache` pass-through options.
- **Auto Cookie Forwarding (SSR)**: Automatically forwards cookies from `next/headers` during SSR rendering.
- **Auto Auth Refresh (401)**: Built-in token refresh queue for Header & httpOnly Cookie authentication patterns without race conditions.
- **Global Event Bus (`api.on`)**: Easily subscribe to global API events (`request`, `response`, `error`, `auth:refreshed`, `auth:refresh-failed`).
- **Hook Chaining (Interceptors)**: Pass a single function or an array of middleware functions for request/response pipelines.
- **Ultra Lightweight**: Zero dependencies, ~4.5KB gzipped.
- **Full Type Safety**: Written 100% in TypeScript with strict null checks and exported declarations.

---

## 📦 Installation

### From GitHub

Install directly from GitHub repository:

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

Or install a specific release version / branch:
```bash
npm install Dungnecauoi/next-fetch-kit#v0.4.0
```

### Local Development

For local development and testing:

```bash
# Relative path from your Next.js project
npm install ../next-fetch-kit

# Or absolute path
npm install /Volumes/SSD-1/Code/lib-nextjs/next-fetch-kit
```

---

## 🚀 Quick Start

```typescript
import { createFetchKit } from 'next-fetch-kit';

const api = createFetchKit({
  baseURL: 'https://api.example.com',
  credentials: 'include',
  timeout: 10000,
});

// GET Request
const { data, status } = await api.get<User[]>('/users');

// POST Request
const { data } = await api.post<User>('/users', {
  body: { name: 'Alice', email: 'alice@example.com' },
});

// PUT, PATCH, DELETE
await api.put<User>('/users/1', { body: { name: 'Bob' } });
await api.patch<User>('/users/1', { body: { name: 'Bob' } });
await api.delete('/users/1');
```

---

## 🔥 Features & Usage Guide

### 1. In-flight Request Deduplication (`dedupe`)

Automatically merges identical simultaneous `GET`/`HEAD` requests fired at the same tick from different UI components (e.g. `Header`, `Sidebar`, `Profile`) into 1 network call.

```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  dedupe: true, // Enabled by default
});

// Component A and Component B call this simultaneously → Only 1 HTTP request is sent!
const [user1, user2] = await Promise.all([
  api.get('/me'),
  api.get('/me'),
]);
```

### 2. Next.js Cache & Revalidation (App Router)

Pass native Next.js cache and revalidation parameters directly:

```typescript
// ISR — revalidate every 60 seconds with cache tags
const { data } = await api.get<Product[]>('/products', {
  next: { revalidate: 60, tags: ['products'] },
});

// Disable cache (SSR fresh fetch)
const { data } = await api.get<User>('/me', {
  cache: 'no-store',
});

// Force cache
const { data } = await api.get<Config>('/config', {
  cache: 'force-cache',
});
```

### 3. SSR Cookie Forwarding (`forwardCookies`)

In Next.js Server Components, native `fetch` does not automatically forward incoming browser cookies to backend microservices. `next-fetch-kit` solves this automatically:

**Option A: Global Auto-forwarding**
```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  credentials: 'include',
  forwardCookies: true, // Auto-reads cookies() from next/headers in SSR
});

// Server Component (RSC) — cookies are automatically forwarded
export default async function Page() {
  const { data } = await api.get<User>('/me');
  return <div>Welcome, {data.name}</div>;
}
```

**Option B: Explicit per-request**
```typescript
import { cookies } from 'next/headers';

export default async function Page() {
  const cookieStore = await cookies();
  const { data } = await api.get<User>('/me', {
    cookies: cookieStore,
  });
  return <div>Welcome, {data.name}</div>;
}
```

### 4. Automatic Token Refresh Queue (401 Unauthorized)

Handles 401 Unauthorized responses with an anti-race-condition request queue mechanism.

**Header-based Authentication (Authorization Bearer Token):**
```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  auth: {
    getToken: () => localStorage.getItem('accessToken'),

    refresh: async (kit) => {
      // Uses raw kit without auth interceptors to prevent refresh loops
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

**Cookie-based Authentication (httpOnly Cookies):**
```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  credentials: 'include',
  auth: {
    refresh: async (kit) => {
      await kit.post('/auth/refresh');
      // Server sets new httpOnly cookie on response
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

### 5. Global Event Bus (`api.on()` / `api.off()`)

Subscribe to global API events from React Contexts, Toast containers, or Auth Providers:

```typescript
// Subscribe to global errors for Toast notifications
const unsubscribe = api.on('error', (error) => {
  toast.error(error.message);
});

// Subscribe to refresh failure for login redirection
api.on('auth:refresh-failed', () => {
  router.push('/login');
});

// Clean up listener when React component unmounts
unsubscribe();
```

### 6. Interceptor Hook Chaining (Array of Functions)

Pass a single function or an array of hook functions executed sequentially in order:

```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  onRequest: [addAuthHeader, addTraceId, logRequest],
  onResponse: [transformDates, logMetrics],
});

// Extending an instance appends child hooks to parent hooks
const childApi = api.extend({
  onRequest: [childSpecificHook],
});
```

### 7. Custom Status Validation (`validateStatus` & `ignoreResponseError`)

```typescript
// Treat 4xx responses as valid responses (do not throw HTTP error)
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  validateStatus: (status) => status < 500,
});

// Shortcut: ignoreResponseError: true
const { data, status } = await api.get('/users/999', {
  ignoreResponseError: true,
});
```

### 8. Retry Engine with Backoff & `maxDelay` Cap

```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  retry: {
    count: 3,
    delay: 1000,
    backoff: true,
    maxDelay: 10000, // Caps delay at maximum 10 seconds
    beforeRetry: ({ attempt, delay, error }) => {
      console.log(`Retrying attempt ${attempt} after ${delay}ms due to ${error.message}`);
    },
  },
});
```

### 9. Query Parameters (`params` / `query` & Extended Types)

Supports `Set`, `Map`, `BigInt`, nested objects, and arrays out-of-the-box:

```typescript
await api.get('/items', {
  query: {
    page: 1,
    limit: 20,
    filter: { status: 'active' },
    ids: new Set([10, 20, 30]),
    bigCount: 9007199254740991n,
  },
});
```

### 10. Data Transformers (`transformRequest` & `transformResponse`)

```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  transformResponse: (data) => convertSnakeToCamel(data),
  transformRequest: (data) => convertCamelToSnake(data),
});
```

### 11. Extend Instance

```typescript
const baseApi = createFetchKit({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

// Inherit all base config + add custom headers
const tenantApi = baseApi.extend({
  headers: { 'X-Tenant-Id': 'tenant-123' },
});
```

### 12. File Upload (FormData)

```typescript
const formData = new FormData();
formData.append('avatar', file);

const { data } = await api.post<UploadResponse>('/upload', {
  body: formData, // Content-Type auto-detected
});
```

---

## 🚨 Error Handling

All thrown errors are instances of `FetchKitError` with typed diagnostic properties:

```typescript
import { FetchKitError, isFetchKitError } from 'next-fetch-kit';

try {
  await api.get('/endpoint');
} catch (error) {
  if (isFetchKitError(error)) {
    console.log(error.type);    // 'http' | 'network' | 'timeout' | 'abort' | 'parse'
    console.log(error.status);  // 404, 500, etc.
    console.log(error.data);    // Parsed response body from server
    console.log(error.message); // Human-readable message

    // Helper methods
    if (error.isHttpError()) { /* 4xx or 5xx */ }
    if (error.isTimeout()) { /* Request timed out */ }
    if (error.isNetworkError()) { /* Network connection failed */ }
    if (error.isAbort()) { /* Request aborted by AbortController */ }
  }
}
```

---

## 📖 API Reference

### `createFetchKit(config)`

| Option | Type | Default | Description |
|:---|:---|:---|:---|
| `baseURL` | `string` | `''` | Base URL for all request paths |
| `headers` | `HeadersInit` | `{}` | Default headers |
| `credentials` | `RequestCredentials` | `'same-origin'` | Credentials mode |
| `timeout` | `number` | `undefined` | Request timeout in milliseconds |
| `retry` | `RetryConfig \| number` | `undefined` | Retry configuration |
| `next` | `NextOptions` | `undefined` | Next.js cache revalidation options |
| `cache` | `RequestCache` | `undefined` | Cache mode |
| `forwardCookies` | `boolean` | `false` | Auto-forward cookies from `next/headers` in SSR |
| `auth` | `AuthConfig` | `undefined` | Auth token management & refresh queue config |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation |
| `dedupe` | `boolean` | `true` | Auto-deduplicate in-flight GET/HEAD requests |
| `validateStatus` | `(status: number) => boolean` | `200..299` | Custom status validator function |
| `ignoreResponseError` | `boolean` | `false` | When true, disables HTTP error throwing |
| `transformRequest` | `(data: any) => any` | `undefined` | Outbound request body transformer |
| `transformResponse` | `(data: any) => any` | `undefined` | Inbound response data transformer |
| `onRequest` | `HookOrArray<Function>` | `undefined` | Before-request hook(s) |
| `onResponse` | `HookOrArray<Function>` | `undefined` | After-response hook(s) |
| `onRequestError` | `HookOrArray<Function>` | `undefined` | Network error hook(s) |
| `onResponseError` | `HookOrArray<Function>` | `undefined` | HTTP error hook(s) |
| `onError` | `HookOrArray<Function>` | `undefined` | Universal error hook(s) |

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
api.on(event, handler)        → () => void (Unsubscribe function)
api.off(event, handler)       → void
```

### `FetchKitResponse<T>`

```typescript
interface FetchKitResponse<T> {
  data: T;           // Parsed response body
  status: number;    // HTTP status code
  statusText: string;
  headers: Headers;  // Response headers
  raw: Response;     // Raw Response object
}
```

---

## 📄 License

[MIT](./LICENSE) © Dungnecauoi
