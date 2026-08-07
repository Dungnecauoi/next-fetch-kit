import { describe, it, expect } from 'vitest';
import { serializeParams, appendParams } from '../src/params';

describe('security — input validation & injection (params)', () => {
  describe('prototype pollution prevention (BUG-7)', () => {
    it('ignores __proto__ key', () => {
      const params = JSON.parse('{"__proto__": {"polluted": true}, "safe": "yes"}');
      const result = serializeParams(params);
      expect(result).toBe('safe=yes');
      expect(result).not.toContain('__proto__');
      expect(result).not.toContain('polluted');
    });

    it('ignores constructor key', () => {
      const params = { constructor: 'evil', name: 'safe' };
      const result = serializeParams(params);
      expect(result).toBe('name=safe');
      expect(result).not.toContain('constructor');
    });

    it('ignores prototype key', () => {
      const params = { prototype: { x: 1 }, name: 'safe' };
      const result = serializeParams(params);
      expect(result).toBe('name=safe');
    });

    it('nested __proto__ is also ignored', () => {
      const params = { filter: JSON.parse('{"__proto__": "evil", "status": "active"}') };
      const result = serializeParams(params);
      expect(result).toBe('filter%5Bstatus%5D=active');
      expect(result).not.toContain('__proto__');
    });
  });

  describe('recursion depth limit (BUG-6)', () => {
    it('handles deeply nested objects gracefully (does not crash)', () => {
      // Build a 50-level deep object
      let deep: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 50; i++) {
        deep = { level: deep };
      }
      // Should NOT throw stack overflow
      expect(() => serializeParams(deep)).not.toThrow();
    });

    it('serializes values beyond MAX_DEPTH as strings', () => {
      // Build object at exactly 12 levels deep (MAX_DEPTH is 10)
      let deep: Record<string, unknown> = { x: 'leaf' };
      for (let i = 0; i < 12; i++) {
        deep = { a: deep };
      }
      const result = serializeParams(deep);
      // Should produce a result (not crash) — the leaf value will be stringified
      expect(result).toBeTruthy();
      expect(result).toContain('%5Bobject%20Object%5D');
    });

    it('survives 1000-level deep nesting', () => {
      let deep: Record<string, unknown> = { end: 'bottom' };
      for (let i = 0; i < 1000; i++) {
        deep = { n: deep };
      }
      expect(() => serializeParams(deep)).not.toThrow();
    });
  });

  describe('special characters & encoding', () => {
    it('encodes & = ? # / \\ in values', () => {
      const result = serializeParams({ q: 'a&b=c?d#e/f\\g' });
      expect(result).toBe('q=a%26b%3Dc%3Fd%23e%2Ff%5Cg');
    });

    it('encodes special chars in keys', () => {
      const result = serializeParams({ 'key with spaces': 'val' });
      expect(result).toBe('key%20with%20spaces=val');
    });

    it('handles unicode/emoji in values', () => {
      const result = serializeParams({ name: '🔥火' });
      expect(result).toContain('%F0%9F%94%A5');
      expect(result).toContain('%E7%81%AB');
    });

    it('handles empty string keys and values', () => {
      const result = serializeParams({ '': 'empty-key', key: '' });
      expect(result).toContain('=empty-key');
      expect(result).toContain('key=');
    });
  });

  describe('type coercion', () => {
    it('handles boolean values', () => {
      const result = serializeParams({ active: true, deleted: false });
      expect(result).toBe('active=true&deleted=false');
    });

    it('handles number values including 0 and NaN', () => {
      const result = serializeParams({ page: 0, limit: NaN });
      expect(result).toContain('page=0');
      expect(result).toContain('limit=NaN');
    });

    it('handles Date values', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const result = serializeParams({ created: date });
      expect(result).toBe('created=2024-01-01T00%3A00%3A00.000Z');
    });

    it('skips undefined and null values', () => {
      const result = serializeParams({ a: undefined, b: null, c: 'ok' });
      expect(result).toBe('c=ok');
    });
  });

  describe('URL construction edge cases', () => {
    it('appends to URL that already has query params', () => {
      const result = appendParams('https://api.com/search?q=test', { page: 1 });
      expect(result).toBe('https://api.com/search?q=test&page=1');
    });

    it('returns original URL when params is empty object', () => {
      const result = appendParams('https://api.com/users', {});
      expect(result).toBe('https://api.com/users');
    });

    it('returns original URL when params is undefined', () => {
      const result = appendParams('https://api.com/users');
      expect(result).toBe('https://api.com/users');
    });

    it('handles URL with hash fragment', () => {
      // Note: hash fragments come after query params, this tests current behavior
      const result = appendParams('https://api.com/page#section', { id: 1 });
      // The fragment will be treated as part of the URL
      expect(result).toContain('id=1');
    });

    it('handles large array params', () => {
      const ids = Array.from({ length: 100 }, (_, i) => i);
      const result = serializeParams({ ids });
      // Should create 100 indexed params
      expect(result).toContain('ids%5B0%5D=0');
      expect(result).toContain('ids%5B99%5D=99');
    });
  });
});
