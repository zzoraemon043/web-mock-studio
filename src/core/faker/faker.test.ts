import { describe, expect, it } from 'vitest';
import { createRng } from '../random.ts';
import { createContext, fake } from './faker.ts';
import { FAKER_KINDS } from './kinds.ts';
import { detectKind, tokenizeKey } from './semantic.ts';

describe('rng', () => {
  it('is deterministic and bounded', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    for (let i = 0; i < 1000; i++) {
      const n = a.int(-5, 5);
      expect(n).toBe(b.int(-5, 5));
      expect(n).toBeGreaterThanOrEqual(-5);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('respects weights', () => {
    const rng = createRng(1);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) counts[rng.weighted([['a', 9], ['b', 1]] as const)]++;
    expect(counts.a).toBeGreaterThan(counts.b * 5);
  });
});

describe('fake', () => {
  it('produces a value for every kind', () => {
    const rng = createRng(3);
    for (const kind of FAKER_KINDS) expect(fake(kind, createContext(rng, 2))).not.toBeUndefined();
  });

  it('respects numeric ranges', () => {
    const rng = createRng(4);
    for (let i = 0; i < 200; i++) {
      const n = fake('integer', { ...createContext(rng), min: 10, max: 12 }) as number;
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it('varies values when only a large minimum is given', () => {
    const rng = createRng(6);
    const seen = new Set<unknown>();
    for (let i = 0; i < 50; i++) {
      const n = fake('integer', { ...createContext(rng), min: 5000 }) as number;
      expect(n).toBeGreaterThanOrEqual(5000);
      seen.add(n);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('keeps out-of-range timestamps valid', () => {
    const rng = createRng(7);
    expect(() => fake('isoDateTime', { ...createContext(rng), min: 1e20 })).not.toThrow();
    expect(() => fake('date', { ...createContext(rng), max: -1e20 })).not.toThrow();
  });

  it('builds an offline SVG avatar data URI', () => {
    expect(fake('avatar', createContext(createRng(5)))).toMatch(/^data:image\/svg\+xml,/);
  });
});

describe('semantic detection', () => {
  it('tokenizes common key styles', () => {
    expect(tokenizeKey('createdAt')).toEqual(['created', 'at']);
    expect(tokenizeKey('user_id')).toEqual(['user', 'id']);
    expect(tokenizeKey('X-Request-ID')).toEqual(['x', 'request', 'id']);
    expect(tokenizeKey('avatarURL')).toEqual(['avatar', 'url']);
  });

  it.each([
    ['email', 'x', 'email'],
    ['firstName', 'Ada', 'firstName'],
    ['last_name', 'L', 'lastName'],
    ['userName', 'ada', 'username'],
    ['avatarUrl', 'https://x.dev/a.png', 'avatar'],
    ['phoneNumber', '123', 'phone'],
    ['city', 'Taipei', 'city'],
    ['countryCode', 'TW', 'countryCode'],
    ['lat', 25.03, 'latitude'],
    ['lng', 121.5, 'longitude'],
    ['updatedAt', '2025-01-01T00:00:00Z', 'isoDateTime'],
    ['createdAt', 1735689600, 'unixSeconds'],
    ['createdAt', 1735689600000, 'unixMillis'],
    ['price', 19.99, 'price'],
    ['id', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'uuid'],
    ['id', 7, 'sequence'],
    ['_id', '507f1f77bcf86cd799439011', 'objectId'],
    ['website', 'https://x.dev', 'url'],
    ['contact', 'ops@x.dev', 'email'],
    ['profile', 'https://medium.com/@ada.l/post.html', 'url'],
    ['description', 'short', 'sentence'],
    ['longDescription', 'short', 'sentence'],
    ['enabled', true, 'boolean'],
    ['count', 3, 'integer'],
  ] as const)('%s = %j -> %s', (key, value, kind) => {
    expect(detectKind(key, value)).toBe(kind);
  });
});
