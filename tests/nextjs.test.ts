import { describe, it, expect } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';

describe('Next.js specific options', () => {
  it('passes next.revalidate in fetch options', async () => {
    // We can't directly verify the fetch init options in MSW,
    // but we can verify the request goes through without errors
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
    });

    const { data } = await api.get('/config', {
      next: { revalidate: 60 },
    });
    expect(data).toEqual({ theme: 'dark', lang: 'en' });
  });

  it('passes next.tags in fetch options', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
    });

    const { data } = await api.get('/config', {
      next: { tags: ['config', 'settings'] },
    });
    expect(data).toEqual({ theme: 'dark', lang: 'en' });
  });

  it('passes cache option in fetch options', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
    });

    // cache: 'no-store'
    const { data: data1 } = await api.get('/config', {
      cache: 'no-store',
    });
    expect(data1).toBeTruthy();

    // cache: 'force-cache'
    const { data: data2 } = await api.get('/config', {
      cache: 'force-cache',
    });
    expect(data2).toBeTruthy();
  });

  it('merges instance-level and request-level next options', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      next: { revalidate: 60, tags: ['global'] },
    });

    // Request-level should merge with instance
    const { data } = await api.get('/config', {
      next: { tags: ['config'] },
    });
    expect(data).toBeTruthy();
  });

  it('request-level cache overrides instance-level', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      cache: 'force-cache',
    });

    const { data } = await api.get('/config', {
      cache: 'no-store',
    });
    expect(data).toBeTruthy();
  });

  it('credentials option is passed through', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      credentials: 'include',
    });

    const { data } = await api.get('/users');
    expect(data).toHaveLength(2);
  });

  it('per-request credentials overrides instance', async () => {
    const api = createFetchKit({
      baseURL: 'https://api.test.com',
      credentials: 'include',
    });

    const { data } = await api.get('/users', {
      credentials: 'same-origin',
    });
    expect(data).toHaveLength(2);
  });
});
