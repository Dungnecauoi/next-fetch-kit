import { describe, it, expect } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';

describe('request body & serialization', () => {
  const api = createFetchKit({ baseURL: 'https://api.test.com' });

  it('sends URLSearchParams body with correct content-type', async () => {
    server.use(
      http.post('https://api.test.com/urlencoded', async ({ request }) => {
        const bodyText = await request.text();
        const contentType = request.headers.get('content-type');
        return HttpResponse.json({ bodyText, contentType });
      }),
    );

    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('username', 'user@example.com');

    const { data } = await api.post<{ bodyText: string; contentType: string }>('/urlencoded', {
      body: params,
    });

    expect(data.contentType).toContain('application/x-www-form-urlencoded');
    expect(data.bodyText).toContain('grant_type=password');
  });

  it('sends FormData body without overriding boundary header', async () => {
    server.use(
      http.post('https://api.test.com/upload', async ({ request }) => {
        const contentType = request.headers.get('content-type') || '';
        return HttpResponse.json({ contentType, isFormData: true });
      }),
    );

    const formData = new FormData();
    formData.append('file', new Blob(['hello world'], { type: 'text/plain' }), 'test.txt');

    const { data } = await api.post<{ contentType: string }>('/upload', {
      body: formData,
    });

    expect(data.contentType).not.toContain('application/json');
  });

  it('sends string body as text/plain', async () => {
    const { data } = await api.post<{ body: string; headers: Record<string, string> }>('/echo', {
      body: 'plain text body',
    });

    expect(data.body).toBe('plain text body');
    expect(data.headers['content-type']).toBe('text/plain');
  });

  it('handles empty / undefined body', async () => {
    const { data } = await api.post<{ body: unknown }>('/echo');
    expect(data.body).toBe('');
  });
});
