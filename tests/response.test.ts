import { describe, it, expect } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';

describe('responseType explicit parsing', () => {
  const api = createFetchKit({ baseURL: 'https://api.test.com' });

  it('parses response as text when responseType: "text"', async () => {
    const { data } = await api.get<string>('/users', {
      responseType: 'text',
    });
    expect(typeof data).toBe('string');
    expect(data).toContain('Alice');
  });

  it('parses response as blob when responseType: "blob"', async () => {
    const { data } = await api.get<Blob>('/users', {
      responseType: 'blob',
    });
    expect(data).toBeDefined();
    expect(typeof data.size).toBe('number');
  });

  it('parses response as arrayBuffer when responseType: "arrayBuffer"', async () => {
    const { data } = await api.get<ArrayBuffer>('/text', {
      responseType: 'arrayBuffer',
    });
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect(data.byteLength).toBeGreaterThan(0);
  });

  it('parses response as json when responseType: "json"', async () => {
    const { data } = await api.get<Array<{ id: number }>>('/users', {
      responseType: 'json',
    });
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].id).toBe(1);
  });

  it('instance-level responseType is inherited', async () => {
    const textApi = createFetchKit({
      baseURL: 'https://api.test.com',
      responseType: 'text',
    });

    const { data } = await textApi.get<string>('/users');
    expect(typeof data).toBe('string');
  });

  it('per-request responseType overrides instance-level', async () => {
    const textApi = createFetchKit({
      baseURL: 'https://api.test.com',
      responseType: 'text',
    });

    const { data } = await textApi.get<Array<{ id: number }>>('/users', {
      responseType: 'json',
    });
    expect(Array.isArray(data)).toBe(true);
  });

  it('handles 204 No Content with undefined data', async () => {
    server.use(
      http.get('https://api.test.com/no-content-204', () => {
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { data, status } = await api.get('/no-content-204');
    expect(status).toBe(204);
    expect(data).toBeUndefined();
  });

  it('handles 205 Reset Content with undefined data', async () => {
    server.use(
      http.get('https://api.test.com/reset-content-205', () => {
        return new HttpResponse(null, { status: 205 });
      }),
    );

    const { data, status } = await api.get('/reset-content-205');
    expect(status).toBe(205);
    expect(data).toBeUndefined();
  });
});
