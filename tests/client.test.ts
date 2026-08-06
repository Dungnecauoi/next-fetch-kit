import { describe, it, expect, vi } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';
import { FetchKitError } from '../src/error';

describe('client — core', () => {
  const api = createFetchKit({ baseURL: 'https://api.test.com' });

  describe('HTTP methods', () => {
    it('GET returns parsed JSON data', async () => {
      const { data, status } = await api.get<Array<{ id: number; name: string }>>('/users');
      expect(status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('Alice');
    });

    it('POST sends body and returns response', async () => {
      const { data, status } = await api.post<{ id: number; name: string }>('/users', {
        body: { name: 'Charlie' },
      });
      expect(status).toBe(201);
      expect(data.name).toBe('Charlie');
      expect(data.id).toBe(3);
    });

    it('PUT sends body and returns response', async () => {
      const { data } = await api.put<{ id: number; name: string }>('/users/1', {
        body: { name: 'Updated' },
      });
      expect(data.id).toBe(1);
      expect(data.name).toBe('Updated');
    });

    it('PATCH sends body and returns response', async () => {
      const { data } = await api.patch<{ id: number; name: string }>('/users/1', {
        body: { name: 'Patched' },
      });
      expect(data.name).toBe('Patched');
    });

    it('DELETE returns 204 with undefined data', async () => {
      const { status, data } = await api.delete('/users/1');
      expect(status).toBe(204);
      expect(data).toBeUndefined();
    });
  });

  describe('Response wrapping', () => {
    it('includes status, statusText, headers, and raw', async () => {
      const response = await api.get('/users');
      expect(response.status).toBe(200);
      expect(response.statusText).toBeTruthy();
      expect(response.headers).toBeInstanceOf(Headers);
      expect(response.raw).toBeInstanceOf(Response);
    });

    it('parses text content type', async () => {
      const { data } = await api.get<string>('/text');
      expect(data).toBe('Hello, World!');
    });
  });

  describe('Error handling', () => {
    it('throws FetchKitError for 4xx', async () => {
      try {
        await api.get('/error/400');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchKitError);
        const e = error as FetchKitError;
        expect(e.status).toBe(400);
        expect(e.isHttpError()).toBe(true);
        expect(e.data).toEqual({ message: 'Bad Request' });
      }
    });

    it('throws FetchKitError for 5xx', async () => {
      try {
        await api.get('/error/500');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchKitError);
        expect((error as FetchKitError).status).toBe(500);
      }
    });
  });

  describe('Query params', () => {
    it('appends params to URL', async () => {
      server.use(
        http.get('https://api.test.com/search', ({ request }) => {
          const url = new URL(request.url);
          return HttpResponse.json({
            q: url.searchParams.get('q'),
            page: url.searchParams.get('page'),
          });
        }),
      );

      const { data } = await api.get<{ q: string; page: string }>('/search', {
        params: { q: 'test', page: 1 },
      });
      expect(data.q).toBe('test');
      expect(data.page).toBe('1');
    });
  });

  describe('Headers', () => {
    it('sends default headers from instance config', async () => {
      const customApi = createFetchKit({
        baseURL: 'https://api.test.com',
        headers: { 'X-Custom': 'hello' },
      });

      const { data } = await customApi.get<Record<string, string>>('/echo-headers');
      expect(data['x-custom']).toBe('hello');
    });

    it('per-request headers override instance headers', async () => {
      const customApi = createFetchKit({
        baseURL: 'https://api.test.com',
        headers: { 'X-Custom': 'instance' },
      });

      const { data } = await customApi.get<Record<string, string>>('/echo-headers', {
        headers: { 'X-Custom': 'request' },
      });
      expect(data['x-custom']).toBe('request');
    });
  });

  describe('Body serialization', () => {
    it('auto-stringifies objects as JSON', async () => {
      const { data } = await api.post<{ body: { name: string }; headers: Record<string, string> }>(
        '/echo',
        { body: { name: 'test' } },
      );
      expect(data.body).toEqual({ name: 'test' });
      expect(data.headers['content-type']).toBe('application/json');
    });
  });

  describe('extend()', () => {
    it('creates a new instance with merged config', async () => {
      const base = createFetchKit({
        baseURL: 'https://api.test.com',
        headers: { 'X-Base': 'true' },
      });

      const extended = base.extend({
        headers: { 'X-Extended': 'true' },
      });

      const { data } = await extended.get<Record<string, string>>('/echo-headers');
      expect(data['x-base']).toBe('true');
      expect(data['x-extended']).toBe('true');
    });

    it('extended instance does not affect parent', async () => {
      const base = createFetchKit({
        baseURL: 'https://api.test.com',
      });

      base.extend({
        headers: { 'X-Child': 'true' },
      });

      const { data } = await base.get<Record<string, string>>('/echo-headers');
      expect(data['x-child']).toBeUndefined();
    });
  });

  describe('Full URL override', () => {
    it('uses full URL when path starts with http', async () => {
      const { data } = await api.get<Array<{ id: number }>>('https://api.test.com/users');
      expect(data).toHaveLength(2);
    });
  });
});
