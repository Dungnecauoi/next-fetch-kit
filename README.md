# next-fetch-kit

A lightweight (~4.5KB gzipped), type-safe, zero-dependency `fetch` wrapper for **Next.js** — designed for seamless operation in both **SSR (Server Components, Route Handlers, Middleware)** and **CSR (Client Components)** with built-in auth refresh queue, real-time upload/download progress tracking, smart auto-FormData conversion, request deduplication, typed event bus, and SSR cookie forwarding.

[![license](https://img.shields.io/github/license/Dungnecauoi/next-fetch-kit.svg)](https://opensource.org/licenses/MIT)
[![tests](https://img.shields.io/badge/tests-306%20passed%20%7C%20100%25%20coverage-brightgreen.svg)](https://github.com/Dungnecauoi/next-fetch-kit)
[![version](https://img.shields.io/badge/version-v0.5.0-blue.svg)](https://github.com/Dungnecauoi/next-fetch-kit/releases/tag/v0.5.0)

---

## 🎯 Compatibility Matrix

`next-fetch-kit` is designed and verified for all modern versions of Next.js and Node.js:

| Framework / Version | App Router (Server Components & Actions) | Pages Router | Minimum Node.js | Status |
|:---|:---:|:---:|:---:|:---:|
| **Next.js 15.x** (Latest) | ✅ Fully Supported | ✅ Supported | Node >= 18.18 | 🟢 Verified |
| **Next.js 14.x** | ✅ Fully Supported | ✅ Supported | Node >= 18.17 | 🟢 Verified |
| **Next.js 13.x** | ✅ Fully Supported | ✅ Supported | Node >= 16.14 | 🟢 Verified |
| **React 18 & React 19** | ✅ Fully Supported | ✅ Supported | - | 🟢 Verified |

> 💡 **Next.js 15 Ready**: Supports both synchronous and async `await cookies()` / `await headers()` from `next/headers` natively without extra wrapper code.

---

## ⚡ Why next-fetch-kit? (Special Features)

- **SSR + CSR Native**: Full compatibility with Next.js App Router (Server Components, Client Components, Route Handlers, and Middleware).
- **📊 Real-time Progress Tracking (`onUploadProgress` / `onDownloadProgress`)**: Track percentage `0–100%`, `loaded`/`total` bytes, transfer `rate` (B/s), and `estimated` remaining seconds via native `xhrFetch` adapter.
- **📂 Smart Dynamic File & MIME Detection**: Automatically resolves exact MIME types for direct `File`/`Blob` uploads (`image/*`, `video/*`, `application/pdf`, `.docx`, `.xlsx`).
- **📦 Smart Auto-FormData Conversion**: Passing a plain JavaScript object containing `File` or `Blob` instances automatically converts it into `FormData` with dynamic multipart boundaries.
- **🔒 Race-Condition-Free Auth Refresh Queue (401)**: Built-in token refresh queue for Header & httpOnly Cookie authentication patterns — handles 10 parallel 401 requests with only 1 token refresh call.
- **🌐 Isomorphic Cookie Forwarding (SSR)**: Automatically forwards cookies from `next/headers` during SSR rendering when `forwardCookies: true`.
- **⚡ In-flight Request Deduplication**: Merges simultaneous identical `GET`/`HEAD` requests fired at the same tick across React components into 1 network call.
- **📢 Typed Event Bus (`api.on`)**: Strict type inference per event (`request`, `response`, `error`, `auth:refreshed`, `auth:refresh-failed`) via `FetchKitEventMap`.
- **⚠️ Development Runtime Warnings**: Helpful `console.warn` in dev mode (`NODE_ENV !== 'production'`) when misconfiguring SSR/CSR options (e.g. `forwardCookies` in CSR or `onUploadProgress` in SSR) without crashing production.
- **💯 100% Test Coverage**: Verified by 306 unit and integration tests across Node.js, MSW, and Browser environments.
- **🪶 Ultra Lightweight**: Zero dependencies, ~4.5KB gzipped.

---

## 📦 Installation

### From GitHub (Latest Release `v0.5.0`)

Install directly from GitHub repository:

```bash
# npm
npm install Dungnecauoi/next-fetch-kit#v0.5.0

# pnpm
pnpm add Dungnecauoi/next-fetch-kit#v0.5.0

# yarn
yarn add Dungnecauoi/next-fetch-kit#v0.5.0

# bun
bun add Dungnecauoi/next-fetch-kit#v0.5.0
```

### Local Development

For local monorepo / workspace development:

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

## 🔥 Highlighted Special Features & Usage Guide

### 1. Real-time Upload & Download Progress Tracking (`onUploadProgress` / `onDownloadProgress`)

Track real-time progress for file uploads and downloads with detailed metrics (`percentage`, `loaded`, `total`, `rate`, `estimated`):

```typescript
await api.post('/upload', {
  body: {
    title: 'Monthly Report',
    file: excelFile,
  },
  onUploadProgress: (progress) => {
    console.log(`Upload percentage: ${progress.percentage}%`);
    console.log(`Transferred: ${progress.loaded} / ${progress.total} bytes`);
    console.log(`Rate: ${progress.rate} B/s — Estimated remaining: ${progress.estimated}s`);
  },
  onDownloadProgress: (progress) => {
    console.log(`Download percentage: ${progress.percentage}%`);
  },
});
```

### 2. Smart Auto-FormData & Dynamic MIME Type Resolution

No need to write `new FormData()` and `.append()` manually! Passing an object containing `File` or `Blob` instances automatically serializes into `FormData`:

```typescript
// Pass a plain JS object containing Files (Images, Videos, PDF, DOCX, XLSX):
await api.post('/products', {
  body: {
    productName: 'Dell XPS 15',
    price: 1500,
    thumbnail: imageFile,      // Auto MIME: image/png or image/jpeg
    specSheet: excelFile,      // Auto MIME: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    document: pdfFile,         // Auto MIME: application/pdf
    videoReview: videoFile,    // Auto MIME: video/mp4
    tags: ['laptop', 'tech'],
  },
});
// ➔ Automatically serialized into multipart/form-data with exact MIME types and boundaries!
```

### 3. Automatic Token Refresh Queue (401 Unauthorized — Anti-Race Condition)

Handles 401 Unauthorized responses with a locking queue mechanism so 10 parallel 401 requests trigger only 1 token refresh call:

**Header-based Authentication (Authorization Bearer Token):**
```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  auth: {
    getToken: () => localStorage.getItem('accessToken'),

    refresh: async (rawKit) => {
      // Uses raw kit without auth interceptors to prevent refresh loops
      const { data } = await rawKit.post<{ accessToken: string }>('/auth/refresh', {
        body: { refreshToken: localStorage.getItem('refreshToken') },
      });
      return data.accessToken;
    },

    onRefreshed: (newToken) => {
      localStorage.setItem('accessToken', newToken as string);
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
    refresh: async (rawKit) => {
      await rawKit.post('/auth/refresh');
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

### 4. SSR Cookie Forwarding (`forwardCookies`)

In Next.js Server Components, native `fetch` does not automatically forward incoming browser cookies to backend microservices. `next-fetch-kit` handles this seamlessly:

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

### 5. In-flight Request Deduplication (`dedupe`)

Automatically merges identical simultaneous `GET`/`HEAD` requests fired at the same tick from different UI components (e.g. `Header`, `Sidebar`, `Profile`) into 1 network call:

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

### 6. Typed Event Bus (`api.on()` / `api.off()`)

Subscribe to global API events from React Contexts, Toast containers, or Auth Providers with full TypeScript type safety (`FetchKitEventMap`):

```typescript
// Subscribe to global errors for Toast notifications (err is typed FetchKitError)
const unsubscribe = api.on('error', (err) => {
  toast.error(err.message);
});

// Subscribe to token refreshed event (token is string | void)
api.on('auth:refreshed', (token) => {
  console.log('New Token:', token);
});

// Clean up listener on unmount
unsubscribe();
```

### 7. Interceptor Hook Chaining (Array of Functions)

Pass a single function or an array of hook functions executed sequentially:

```typescript
const api = createFetchKit({
  baseURL: 'https://api.example.com',
  onRequest: [addTraceId, logHeaders],
  onResponse: [transformDates, logMetrics],
});

// Extending an instance appends child hooks to parent hooks
const childApi = api.extend({
  onRequest: [childSpecificHook],
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
| `onUploadProgress` | `ProgressCallback` | `undefined` | Upload progress callback (0-100%) |
| `onDownloadProgress` | `ProgressCallback` | `undefined` | Download progress callback (0-100%) |
| `validateStatus` | `(status: number) => boolean` | `200..299` | Custom status validator function |
| `ignoreResponseError` | `boolean` | `false` | When true, disables HTTP error throwing |
| `transformRequest` | `(data: any) => any` | `undefined` | Outbound request body transformer |
| `transformResponse` | `(data: any) => any` | `undefined` | Inbound response data transformer |
| `onRequest` | `HookOrArray<Function>` | `undefined` | Before-request hook(s) |
| `onResponse` | `HookOrArray<Function>` | `undefined` | After-response hook(s) |
| `onRequestError` | `HookOrArray<Function>` | `undefined` | Network error hook(s) |
| `onResponseError` | `HookOrArray<Function>` | `undefined` | HTTP error hook(s) |
| `onError` | `HookOrArray<Function>` | `undefined` | Universal error hook(s) |

---

## 📄 License

[MIT](./LICENSE) © Dungnecauoi
