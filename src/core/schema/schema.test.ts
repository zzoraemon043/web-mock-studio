import { describe, expect, it } from 'vitest';
import { generateRecords, generateValue } from './generate.ts';
import { inferSchema, parseJson, SCHEMA_DIALECT } from './infer.ts';
import { listFields, pathToString, updateField } from './fields.ts';
import type { JsonSchema } from './types.ts';

const users = [
  { id: 1, name: 'Ada Lovelace', email: 'ada@x.dev', role: 'admin', score: 9.5, active: true, tags: ['a', 'b'], createdAt: '2025-01-01T00:00:00Z' },
  { id: 2, name: 'Alan Turing', email: 'alan@x.dev', role: 'member', score: 7.25, active: false, tags: [], createdAt: '2025-02-01T00:00:00Z', nickname: null },
  { id: 3, name: 'Grace Hopper', email: 'grace@x.dev', role: 'member', score: 8, active: true, tags: ['c'], createdAt: '2025-03-01T00:00:00Z', nickname: 'amazing' },
  { id: 4, name: 'Linus Torvalds', email: 'linus@x.dev', role: 'admin', score: 6, active: true, tags: ['d'], createdAt: '2025-04-01T00:00:00Z' },
];

describe('inferSchema', () => {
  const schema = inferSchema(users, 'User');
  const item = schema.items as JsonSchema;

  it('emits a 2020-12 array schema for list samples', () => {
    expect(schema.$schema).toBe(SCHEMA_DIALECT);
    expect(schema.title).toBe('User');
    expect(schema.type).toBe('array');
    expect(item.type).toBe('object');
  });

  it('computes required as keys present in every element', () => {
    expect(item.required).toEqual(['id', 'name', 'email', 'role', 'score', 'active', 'tags', 'createdAt']);
    expect(item.required).not.toContain('nickname');
  });

  it('detects formats and semantic generators', () => {
    expect(item.properties?.id).toMatchObject({ type: 'integer', 'x-faker': 'sequence' });
    expect(item.properties?.name).toMatchObject({ type: 'string', 'x-faker': 'fullName' });
    expect(item.properties?.email).toMatchObject({ type: 'string', format: 'email', 'x-faker': 'email' });
    expect(item.properties?.createdAt).toMatchObject({ type: 'string', format: 'date-time', 'x-faker': 'isoDateTime' });
    expect(item.properties?.active).toEqual({ type: 'boolean' });
  });

  it('widens integer and number unions and records ranges', () => {
    expect(item.properties?.score).toMatchObject({ type: 'number', minimum: 6, maximum: 9.5 });
  });

  it('detects categorical enums from repeated values', () => {
    expect(item.properties?.role?.enum).toEqual(['admin', 'member']);
  });

  it('infers very large outer arrays without overflowing the call stack', () => {
    const big = Array.from({ length: 200000 }, () => [1]);
    const schema = inferSchema(big);
    expect(schema.type).toBe('array');
    expect(schema.items?.type).toBe('array');
  });

  it('drops enum when a field mixes several types', () => {
    const schema = inferSchema({ v: ['a', 'a', 'a', 'a', 1] });
    const items = schema.properties?.v?.items;
    expect(items?.type).toEqual(['string', 'integer']);
    expect(items?.enum).toBeUndefined();
  });

  it('marks nullable fields with a type union', () => {
    expect(item.properties?.nickname?.type).toEqual(['string', 'null']);
  });

  it('derives array length bounds and singular item names', () => {
    expect(item.properties?.tags).toMatchObject({ type: 'array', minItems: 0, maxItems: 2 });
    expect(item.properties?.tags?.items?.type).toBe('string');
  });

  it('expands a single known status value to its vocabulary', () => {
    expect(inferSchema({ status: 'active' }).properties?.status?.enum).toEqual(['active', 'inactive', 'pending', 'suspended', 'archived']);
    expect(inferSchema({ status: 'ACTIVE' }).properties?.status?.enum?.[1]).toBe('INACTIVE');
  });

  it('widens ranges from a single numeric observation', () => {
    expect(inferSchema({ age: 30 }).properties?.age).toMatchObject({ type: 'integer', minimum: 0, maximum: 60 });
  });

  it('handles primitives, empty arrays and nested objects', () => {
    expect(inferSchema('x').type).toBe('string');
    expect(inferSchema(null).type).toBe('null');
    expect(inferSchema([])).toMatchObject({ type: 'array', minItems: 0, maxItems: 0 });
    expect(inferSchema({ a: { b: { c: 1 } } }).properties?.a?.properties?.b?.properties?.c?.type).toBe('integer');
  });
});

describe('edge cases', () => {
  it('keeps a __proto__ key as an ordinary property', () => {
    const parsed = parseJson('{"__proto__":{"x":1},"name":"Ada"}');
    const schema = inferSchema(parsed.value);
    expect(Object.keys(schema.properties ?? {})).toEqual(['__proto__', 'name']);
    expect(schema.required).toEqual(['__proto__', 'name']);
    const [record] = generateRecords(schema, 1, { seed: 1 }) as Record<string, unknown>[];
    expect(Object.keys(record ?? {})).toEqual(['__proto__', 'name']);
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
    expect(Object.keys(Object.getOwnPropertyDescriptor(record, '__proto__')?.value as object)).toEqual(['x']);
  });

  it('rejects samples nested too deeply instead of overflowing the stack', () => {
    const parsed = parseJson('['.repeat(3000) + ']'.repeat(3000));
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/nested deeper than 256 levels/);
    expect(parseJson('['.repeat(200) + ']'.repeat(200)).ok).toBe(true);
  });

  it('keeps numeric bounds and generated values finite near the float limit', () => {
    for (const sample of [{ f: 1e308 }, { f: -1e308 }, { f: 1.5e308 }]) {
      const schema = inferSchema(sample);
      const field = schema.properties?.f;
      expect(Number.isFinite(field?.minimum)).toBe(true);
      expect(Number.isFinite(field?.maximum)).toBe(true);
      const records = generateRecords(schema, 20, { seed: 3 }) as { f: unknown }[];
      for (const record of records) expect(Number.isFinite(record.f)).toBe(true);
    }
    const wide = inferSchema([{ f: -1.7e308 }, { f: 1.7e308 }, { f: 0.5 }]);
    const records = generateRecords(wide, 20, { seed: 4 }) as { f: unknown }[];
    for (const record of records) expect(Number.isFinite(record.f)).toBe(true);
  });
});

describe('generate', () => {
  const schema = inferSchema(users);

  it('is deterministic for a given seed', () => {
    expect(generateRecords(schema, 20, { seed: 'demo' })).toEqual(generateRecords(schema, 20, { seed: 'demo' }));
    expect(generateRecords(schema, 20, { seed: 'demo' })).not.toEqual(generateRecords(schema, 20, { seed: 'other' }));
  });

  it('produces records that satisfy the inferred schema', () => {
    const records = generateRecords(schema, 100, { seed: 1 }) as Record<string, unknown>[];
    expect(records).toHaveLength(100);
    records.forEach((r, i) => {
      expect(r.id).toBe(i + 1);
      expect(typeof r.name).toBe('string');
      expect(r.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
      expect(['admin', 'member']).toContain(r.role);
      expect(r.score as number).toBeGreaterThanOrEqual(6);
      expect(r.score as number).toBeLessThanOrEqual(9.5);
      expect(typeof r.active).toBe('boolean');
      expect(Array.isArray(r.tags)).toBe(true);
      expect((r.tags as unknown[]).length).toBeLessThanOrEqual(2);
      expect(Number.isNaN(Date.parse(r.createdAt as string))).toBe(false);
      for (const key of ['id', 'name', 'email', 'role', 'score', 'active', 'tags', 'createdAt']) expect(r).toHaveProperty(key);
    });
  });

  it('keeps persona fields consistent within a record', () => {
    const s = inferSchema({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@x.dev' });
    const records = generateRecords(s, 30, { seed: 7 }) as { firstName: string; lastName: string; email: string }[];
    for (const r of records) expect(r.email.startsWith(`${r.firstName}.${r.lastName}`.toLowerCase())).toBe(true);
  });

  it('honors const, enum, and string length limits', () => {
    const value = generateValue(
      { type: 'object', properties: { v: { const: 3 }, e: { enum: ['x'] }, s: { type: 'string', 'x-faker': 'paragraph', maxLength: 5 } }, required: ['v', 'e', 's'] },
      { seed: 1 },
    );
    expect(value).toMatchObject({ v: 3, e: 'x' });
    expect((value as { s: string }).s.length).toBeLessThanOrEqual(5);
  });

  it('generates uuid v4 strings and clamps record counts', () => {
    const records = generateRecords({ type: 'string', format: 'uuid' }, 5, { seed: 2 }) as string[];
    for (const id of records) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(generateRecords({ type: 'integer' }, -3)).toEqual([]);
  });

  it('stops at maxDepth for recursive-looking schemas', () => {
    const deep: JsonSchema = { type: 'object', properties: { child: { type: 'object', properties: { child: { type: 'object', properties: {} } } } }, required: ['child'] };
    expect(generateValue(deep, { maxDepth: 1, seed: 1 })).toEqual({ child: {} });
  });
});

describe('schema fields', () => {
  it('lists nested fields and patches by path', () => {
    const schema = inferSchema([{ id: 1, profile: { city: 'Taipei' } }]);
    const fields = listFields(schema);
    expect(fields.map((f) => pathToString(f.path))).toEqual(['[].id', '[].profile', '[].profile.city']);
    const city = fields[2];
    if (!city) throw new Error('missing field');
    const patched = updateField(schema, city.path, (n) => ({ ...n, 'x-faker': 'country' }));
    expect(patched.items?.properties?.profile?.properties?.city?.['x-faker']).toBe('country');
    expect(schema.items?.properties?.profile?.properties?.city?.['x-faker']).toBe('city');
  });
});
