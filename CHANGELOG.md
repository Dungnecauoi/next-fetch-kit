# Changelog

All notable changes to `next-fetch-kit` are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.1] — 2026-08-08

### Fixed
- **`onRefreshed` callback now fires for cookie-based auth** — Previously `onRefreshed` was silently skipped when `auth.refresh` returned `void` (cookie-based pattern). Now it fires correctly for both token-string and cookie-based refresh flows.
- **AbortSignal listener memory leak in retry sleep** — `removeEventListener('abort', ...)` is now called when the retry delay timer resolves, preventing accumulation of dead listeners on long-running retry chains.

### Changed
- `AuthConfig.onRefreshed` signature updated to `(newToken?: string | void) => void | Promise<void>` to properly accept cookie-based (void) refresh results alongside token-string results.

### Added
- Typed event emitter — `api.on()` now accepts a typed payload parameter per event (`RequestContext` for `'request'`, `FetchKitResponse` for `'response'`, etc.) via `FetchKitEventMap` interface.
- `CHANGELOG.md` (this file) added to the repository.
- Expanded test coverage: `cookies.test.ts` (55% → ~88%), `auth.test.ts` (73% → ~92%) with new unit tests for `createAuthManager` internals, `getNextServerOrigin()`, and all `CookieStore` serialization branches.

---

## [0.4.0] — 2026-08-07

### Added
- **Global Event Bus** — `api.on(event, handler)` / `api.off(event, handler)` for subscribing to lifecycle events: `request`, `response`, `error`, `retry`, `auth:refreshed`, `auth:refresh-failed`. Returns an unsubscribe function.
- **Hook Chaining** — `onRequest`, `onResponse`, `onRequestError`, `onResponseError`, `onError` all accept a single function or an array of functions that are executed in sequence (middleware pattern).
- **`instance.extend(overrides)`** — Create a derived instance that inherits all parent config and merges/appends hooks from the override.
- **`BeforeRetryDetails`** interface exported for `beforeRetry` callback typing.
- **`FetchKitEventType`** and **`FetchKitEventHandler`** types exported.
- **`HookOrArray<T>`** utility type exported.

### Changed
- Retry `beforeRetry` callback now receives a strongly typed `BeforeRetryDetails` object (`{ attempt, delay, error }`).
- `mergeInstanceConfigs` now properly chains hooks from parent and child instances instead of replacing them.

### Fixed
- `maxDelay` cap on exponential backoff retry now correctly limits delay to the specified maximum.
- `onRequest` hooks in the auth-retry path are now re-applied on the retry request context.

---

## [0.3.0] — 2026-08-06

### Added
- **Retry Engine** — `retry: { count, delay, backoff, maxDelay, retryOn, methods, beforeRetry }` with exponential backoff and per-method filtering.
- **`transformRequest`** — Transform outgoing request body before serialization.
- **`transformResponse`** — Transform incoming parsed response data.
- **`validateStatus`** — Custom function to decide which HTTP status codes are valid (overrides default 200–299 check).
- **`ignoreResponseError`** — Shorthand to disable HTTP error throwing for 4xx/5xx responses, returning `{ data, status }` instead.
- **`dedupe`** — In-flight GET/HEAD request deduplication (enabled by default). Identical simultaneous requests share one network call.
- Security: `params.ts` prototype pollution protection (`__proto__`, `constructor`, `prototype` keys are skipped).
- Security: `MAX_DEPTH = 10` recursion guard in query parameter serialization.

### Changed
- Separated `FetchKitConfig` and `RequestConfig` — per-request overrides are now fully typed and independent of instance config.
- `retry: false` on a per-request basis correctly disables instance-level retry config for that request.

---

## [0.2.0] — 2026-08-04

### Added
- **SSR Cookie Forwarding** — `forwardCookies: true` auto-reads `cookies()` from `next/headers` during Server Component rendering and sets the `Cookie` request header.
- **Per-request `cookies` option** — Pass a `CookieStore` (from `next/headers`) or a raw cookie string to override global `forwardCookies` for a specific request.
- **SSR Relative URL Auto-resolution** — On the server side, relative paths (e.g. `/api/posts`) are automatically resolved to an absolute URL using the `host` header from `next/headers`, preventing `TypeError: Invalid URL` in Node.js native fetch.
- **`forwardCookies` is ignored in CSR** — No-op when `window` is defined, so the same client instance works in both SSR and CSR contexts.

### Fixed
- `cookies()` from `next/headers` called outside active request context no longer logs a console warning — it silently returns `undefined`.

---

## [0.1.0] — 2026-08-01

### Added
- Initial release of `next-fetch-kit`.
- `createFetchKit(config)` factory function returning a typed `FetchKitInstance`.
- HTTP methods: `get`, `post`, `put`, `patch`, `delete`, `head`, `options`.
- `baseURL` + path concatenation with proper slash handling.
- Query parameters via `params` / `query` (alias) — supports nested objects, arrays, `Set`, `Map`, `BigInt`, `Date`.
- Body serialization: JSON (auto), FormData (passthrough), Blob, URLSearchParams, ArrayBuffer, ReadableStream, plain string.
- Response auto-parsing: JSON, text, blob, binary — with explicit `responseType` override.
- Timeout via `AbortController` with combined user signal support.
- `FetchKitError` class with typed `type` (`http`, `network`, `timeout`, `abort`, `parse`) and helper methods.
- `isFetchKitError(err)` type guard.
- Auth token management: `getToken`, `refresh`, `onRefreshed`, `onRefreshFailed`.
- Anti-race-condition 401 refresh queue — only one refresh call is made when multiple requests receive 401 simultaneously.
- Anti-refresh-loop protection — refresh endpoint 401 does not trigger another refresh.
- Next.js `next: { revalidate, tags }` and `cache` pass-through options.
- Custom `fetch` implementation override per instance or per request.
- Dual ESM + CJS output with full TypeScript declaration files.
- Zero runtime dependencies. `next` is an optional peer dependency.
- MIT License.
