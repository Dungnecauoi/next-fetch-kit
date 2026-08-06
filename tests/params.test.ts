import { describe, it, expect } from 'vitest';
import { serializeParams, appendParams } from '../src/params';

describe('serializeParams', () => {
  it('serializes simple key-value pairs', () => {
    expect(serializeParams({ page: 1, limit: 20 })).toBe('page=1&limit=20');
  });

  it('serializes string values', () => {
    expect(serializeParams({ name: 'John', role: 'admin' })).toBe('name=John&role=admin');
  });

  it('skips undefined values', () => {
    expect(serializeParams({ a: 1, b: undefined, c: 3 })).toBe('a=1&c=3');
  });

  it('skips null values', () => {
    expect(serializeParams({ a: 1, b: null, c: 3 })).toBe('a=1&c=3');
  });

  it('serializes nested objects', () => {
    const result = serializeParams({ filter: { status: 'active', role: 'admin' } });
    expect(result).toBe('filter%5Bstatus%5D=active&filter%5Brole%5D=admin');
  });

  it('serializes arrays', () => {
    const result = serializeParams({ ids: [1, 2, 3] });
    expect(result).toBe('ids%5B0%5D=1&ids%5B1%5D=2&ids%5B2%5D=3');
  });

  it('serializes boolean values', () => {
    expect(serializeParams({ active: true, deleted: false })).toBe('active=true&deleted=false');
  });

  it('encodes special characters', () => {
    expect(serializeParams({ q: 'hello world' })).toBe('q=hello%20world');
    expect(serializeParams({ q: 'a&b=c' })).toBe('q=a%26b%3Dc');
  });

  it('serializes Date values as ISO string', () => {
    const date = new Date('2025-01-01T00:00:00.000Z');
    const result = serializeParams({ date });
    expect(result).toBe('date=2025-01-01T00%3A00%3A00.000Z');
  });

  it('returns empty string for empty object', () => {
    expect(serializeParams({})).toBe('');
  });

  it('handles deeply nested objects', () => {
    const result = serializeParams({ a: { b: { c: 'deep' } } });
    expect(result).toContain('deep');
  });
});

describe('appendParams', () => {
  it('appends params to a URL without existing query', () => {
    expect(appendParams('https://api.com/users', { page: 1 })).toBe(
      'https://api.com/users?page=1',
    );
  });

  it('appends params to a URL with existing query', () => {
    expect(appendParams('https://api.com/users?sort=name', { page: 1 })).toBe(
      'https://api.com/users?sort=name&page=1',
    );
  });

  it('returns original URL when params is undefined', () => {
    expect(appendParams('https://api.com/users')).toBe('https://api.com/users');
  });

  it('returns original URL when params is empty', () => {
    expect(appendParams('https://api.com/users', {})).toBe('https://api.com/users');
  });

  it('returns original URL when all params are null/undefined', () => {
    expect(appendParams('https://api.com/users', { a: null, b: undefined })).toBe(
      'https://api.com/users',
    );
  });
});
