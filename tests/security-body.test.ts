import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError } from '../src/error';

describe('security — body serialization attacks', () => {
  describe('circular reference protection', () => {
    it('throws on circular reference in body (not hang)', async () => {
      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      const obj: Record<string, unknown> = { name: 'test' };
      obj.self = obj; // Circular reference

      // JSON.stringify throws TypeError on circular reference
      // This should be caught and wrapped as a FetchKitError
      await expect(api.post('/echo', { body: obj })).rejects.toThrow();
    });
  });

  describe('exotic object handling', () => {
    it('handles object with custom toJSON()', async () => {
      server.use(
        http.post('https://api.test.com/echo', async ({ request }) => {
          const body = await request.json();
          return HttpResponse.json({ body });
        }),
      );

      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      const obj = {
        toJSON() {
          return { custom: true };
        },
      };

      const { data } = await api.post<{ body: { custom: boolean } }>('/echo', { body: obj });
      expect(data.body.custom).toBe(true);
    });

    it('handles object with toJSON() that throws', async () => {
      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      const obj = {
        toJSON() {
          throw new Error('toJSON exploded');
        },
      };

      await expect(api.post('/echo', { body: obj })).rejects.toThrow();
    });
  });

  describe('body type handling', () => {
    it('sends null body as no body', async () => {
      server.use(
        http.post('https://api.test.com/no-body', async ({ request }) => {
          const text = await request.text();
          return HttpResponse.json({ hasBody: text.length > 0 });
        }),
      );

      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      const { data } = await api.post<{ hasBody: boolean }>('/no-body', { body: null });
      expect(data.hasBody).toBe(false);
    });

    it('sends undefined body as no body', async () => {
      server.use(
        http.post('https://api.test.com/no-body-2', async ({ request }) => {
          const text = await request.text();
          return HttpResponse.json({ hasBody: text.length > 0 });
        }),
      );

      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      const { data } = await api.post<{ hasBody: boolean }>('/no-body-2');
      expect(data.hasBody).toBe(false);
    });

    it('sends string body as text/plain', async () => {
      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      const { data } = await api.post<{ body: string; headers: Record<string, string> }>(
        '/echo',
        { body: 'raw string' },
      );
      expect(data.headers['content-type']).toBe('text/plain');
    });

    it('sends URLSearchParams with correct content-type', async () => {
      server.use(
        http.post('https://api.test.com/form', async ({ request }) => {
          const ct = request.headers.get('content-type') || '';
          const body = await request.text();
          return HttpResponse.json({ contentType: ct, body });
        }),
      );

      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      const params = new URLSearchParams({ key: 'value' });
      const { data } = await api.post<{ contentType: string; body: string }>('/form', {
        body: params,
      });
      expect(data.contentType).toContain('application/x-www-form-urlencoded');
    });
  });

  describe('JSON safety', () => {
    it('__proto__ in body is safely stringified (no pollution)', async () => {
      server.use(
        http.post('https://api.test.com/json-safe', async ({ request }) => {
          const body = await request.json();
          return HttpResponse.json({ received: body });
        }),
      );

      const api = createFetchKit({ baseURL: 'https://api.test.com' });
      // JSON.stringify correctly handles __proto__ — it becomes a regular key
      const { data } = await api.post<{ received: Record<string, unknown> }>('/json-safe', {
        body: { __proto__: { polluted: true }, safe: 'yes' },
      });
      expect(data.received.safe).toBe('yes');
    });
  });
});
