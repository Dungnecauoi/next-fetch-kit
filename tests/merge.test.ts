import { describe, it, expect } from 'vitest';
import { mergeHeaders, mergeNextOptions, mergeInstanceConfigs, normalizeRetry } from '../src/merge';

describe('merge module', () => {
  describe('mergeHeaders()', () => {
    it('merges Headers objects and plain objects', () => {
      const base = { 'X-Base': '1', Authorization: 'Bearer base' };
      const override = { 'X-Override': '2', authorization: 'Bearer override' };

      const merged = mergeHeaders(base, override);
      expect(merged.get('x-base')).toBe('1');
      expect(merged.get('x-override')).toBe('2');
      // Case-insensitive overwrite
      expect(merged.get('authorization')).toBe('Bearer override');
    });

    it('handles empty / undefined inputs', () => {
      const merged = mergeHeaders(undefined, undefined);
      expect(Array.from(merged.keys())).toHaveLength(0);
    });

    it('merges Headers instance inputs', () => {
      const base = new Headers({ 'X-Test': 'base' });
      const override = new Headers({ 'X-Test': 'override' });

      const merged = mergeHeaders(base, override);
      expect(merged.get('x-test')).toBe('override');
    });
  });

  describe('mergeNextOptions()', () => {
    it('concatenates and deduplicates tags', () => {
      const base = { tags: ['global', 'user'] };
      const override = { tags: ['user', 'profile'] };

      const merged = mergeNextOptions(base, override);
      expect(merged?.tags).toEqual(['global', 'user', 'profile']);
    });

    it('overrides revalidate option', () => {
      const base = { revalidate: 60 };
      const override = { revalidate: 3600 };

      const merged = mergeNextOptions(base, override);
      expect(merged?.revalidate).toBe(3600);
    });
  });

  describe('normalizeRetry()', () => {
    it('converts number shorthand to RetryConfig', () => {
      expect(normalizeRetry(3)).toEqual({ count: 3 });
    });

    it('returns undefined for false', () => {
      expect(normalizeRetry(false)).toBeUndefined();
    });

    it('returns object as-is', () => {
      const config = { count: 5, delay: 500 };
      expect(normalizeRetry(config)).toEqual(config);
    });
  });

  describe('mergeInstanceConfigs()', () => {
    it('deep merges auth config when extending', () => {
      const base = {
        baseURL: 'https://api.test.com',
        auth: { getToken: () => 'token1' },
      };

      const override = {
        auth: { onRefreshFailed: () => {} },
      };

      const merged = mergeInstanceConfigs(base, override);
      expect(merged.auth?.getToken).toBeDefined();
      expect(merged.auth?.onRefreshFailed).toBeDefined();
    });
  });
});
