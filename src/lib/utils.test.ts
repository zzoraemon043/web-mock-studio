import { describe, expect, it } from 'vitest';
import { formatBytes, fuzzyScore, slugify } from './utils.ts';
import { sampleUrlForPattern } from '../app/actions.ts';

describe('fuzzyScore', () => {
  it('ranks substring matches above subsequences and rejects non-matches', () => {
    expect(fuzzyScore('runner', 'Go to Request Runner')).toBeGreaterThan(fuzzyScore('rnr', 'Go to Request Runner'));
    expect(fuzzyScore('rnr', 'Go to Request Runner')).toBeGreaterThan(0);
    expect(fuzzyScore('runner', 'User 7')).toBe(-1);
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});

describe('helpers', () => {
  it('slugifies and formats sizes', () => {
    expect(slugify('  Hello, World!  ')).toBe('hello-world');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('builds sample URLs from patterns', () => {
    expect(sampleUrlForPattern('/api/users/:id/posts/{postId}')).toBe('/api/users/1/posts/1');
    expect(sampleUrlForPattern('/files/*')).toBe('/files/example');
  });
});
