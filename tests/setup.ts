// ============================================================================
// next-fetch-kit — Test Setup (MSW)
// ============================================================================

import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// ---------------------------------------------------------------------------
// Default handlers for common test scenarios
// ---------------------------------------------------------------------------

export const handlers = [
  // GET /users
  http.get('https://api.test.com/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
  }),

  // GET /users/:id
  http.get('https://api.test.com/users/:id', ({ params }) => {
    return HttpResponse.json({ id: Number(params.id), name: 'Alice' });
  }),

  // POST /users
  http.post('https://api.test.com/users', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 3, ...body }, { status: 201 });
  }),

  // PUT /users/:id
  http.put('https://api.test.com/users/:id', async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: Number(params.id), ...body });
  }),

  // PATCH /users/:id
  http.patch('https://api.test.com/users/:id', async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: Number(params.id), ...body });
  }),

  // DELETE /users/:id
  http.delete('https://api.test.com/users/:id', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // GET /text — returns plain text
  http.get('https://api.test.com/text', () => {
    return new HttpResponse('Hello, World!', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }),

  // GET /error/400
  http.get('https://api.test.com/error/400', () => {
    return HttpResponse.json({ message: 'Bad Request' }, { status: 400 });
  }),

  // GET /error/401
  http.get('https://api.test.com/error/401', () => {
    return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }),

  // GET /error/500
  http.get('https://api.test.com/error/500', () => {
    return HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }),

  // GET /me — returns current user (needs auth)
  http.get('https://api.test.com/me', ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth || auth === 'Bearer expired') {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return HttpResponse.json({ id: 1, name: 'Authenticated User', token: auth });
  }),

  // POST /auth/refresh
  http.post('https://api.test.com/auth/refresh', () => {
    return HttpResponse.json({ accessToken: 'new-token-123' });
  }),

  // GET /slow — delays 2 seconds
  http.get('https://api.test.com/slow', async () => {
    await new Promise((r) => setTimeout(r, 2000));
    return HttpResponse.json({ message: 'slow response' });
  }),

  // GET /config — for cache tests
  http.get('https://api.test.com/config', () => {
    return HttpResponse.json({ theme: 'dark', lang: 'en' });
  }),

  // GET /echo-headers — echoes back request headers
  http.get('https://api.test.com/echo-headers', ({ request }) => {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return HttpResponse.json(headers);
  }),

  // POST /echo — echoes back the request body and headers
  http.post('https://api.test.com/echo', async ({ request }) => {
    const contentType = request.headers.get('content-type') || '';
    let body: unknown;
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      body = await request.text();
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return HttpResponse.json({ body, headers });
  }),
];

// ---------------------------------------------------------------------------
// MSW Server
// ---------------------------------------------------------------------------

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
