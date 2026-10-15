import { createContext, fake, type FakerContext } from '../faker/faker.ts';
import type { FakerKind } from '../faker/kinds.ts';
import { createRng, type Rng } from '../random.ts';
import type { JsonSchema, JsonSchemaType } from './types.ts';

export interface GenerateOptions {
  seed?: string | number;
  /** Probability that an optional (non-required) property is emitted. */
  optionalRate?: number;
  /** Probability that a nullable field resolves to null. */
  nullRate?: number;
  maxDepth?: number;
}

interface State {
  rng: Rng;
  optionalRate: number;
  nullRate: number;
  maxDepth: number;
}

const FORMAT_KINDS: Record<string, FakerKind> = {
  uuid: 'uuid',
  email: 'email',
  'date-time': 'isoDateTime',
  date: 'date',
  uri: 'url',
  url: 'url',
  ipv4: 'ipv4',
  hostname: 'domain',
};

function resolveType(schema: JsonSchema, state: State): JsonSchemaType | undefined {
  const { type } = schema;
  if (Array.isArray(type)) {
    const concrete = type.filter((t) => t !== 'null');
    if (type.includes('null') && (concrete.length === 0 || state.rng.bool(state.nullRate))) return 'null';
    return concrete[0];
  }
  if (type) return type;
  if (schema.properties) return 'object';
  if (schema.items) return 'array';
  return undefined;
}

function clampString(value: string, schema: JsonSchema): string {
  let out = value;
  if (schema.maxLength !== undefined && out.length > schema.maxLength) out = out.slice(0, schema.maxLength);
  if (schema.minLength !== undefined) while (out.length < schema.minLength) out += 'x';
  return out;
}

function fakeWithRange(kind: FakerKind, ctx: FakerContext, schema: JsonSchema): unknown {
  return fake(kind, { ...ctx, min: schema.minimum, max: schema.maximum });
}

function generateNode(schema: JsonSchema, ctx: FakerContext, state: State, depth: number): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum && schema.enum.length > 0) return state.rng.pick(schema.enum);

  const type = resolveType(schema, state);
  const kind = schema['x-faker'];

  switch (type) {
    case 'null':
    case undefined:
      return null;
    case 'boolean':
      return state.rng.bool();
    case 'integer':
    case 'number': {
      const value = kind ? fakeWithRange(kind, ctx, schema) : undefined;
      if (typeof value === 'number') return type === 'integer' ? Math.round(value) : value;
      return fakeWithRange(type === 'integer' ? 'integer' : 'float', ctx, schema);
    }
    case 'string': {
      const resolved = kind ?? (schema.format ? FORMAT_KINDS[schema.format] : undefined) ?? 'word';
      return clampString(String(fakeWithRange(resolved, ctx, schema)), schema);
    }
    case 'array': {
      if (depth >= state.maxDepth || !schema.items) return [];
      const min = schema.minItems ?? 1;
      const max = Math.max(min, schema.maxItems ?? Math.max(min, 5));
      const length = state.rng.int(min, max);
      return Array.from({ length }, (_, i) => generateNode(schema.items as JsonSchema, childContext(ctx, i, schema.items), state, depth + 1));
    }
    case 'object': {
      if (depth >= state.maxDepth) return {};
      const required = new Set(schema.required ?? []);
      const out: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        if (!required.has(key) && !state.rng.bool(state.optionalRate)) continue;
        out[key] = generateNode(prop, ctx, state, depth + 1);
      }
      return out;
    }
  }
}

/**
 * Objects inside arrays get a fresh persona so each element is a distinct entity;
 * scalars inside arrays keep the parent persona but advance the index.
 */
function childContext(parent: FakerContext, index: number, items: JsonSchema | undefined): FakerContext {
  const isObject = items?.type === 'object' || (Array.isArray(items?.type) && items.type.includes('object')) || !!items?.properties;
  if (isObject) return createContext(parent.rng, index, parent.baseTime);
  return { ...parent, index };
}

function createState(options: GenerateOptions): State {
  return {
    rng: createRng(options.seed ?? Date.now()),
    optionalRate: options.optionalRate ?? 0.8,
    nullRate: options.nullRate ?? 0.1,
    maxDepth: options.maxDepth ?? 12,
  };
}

export function generateValue(schema: JsonSchema, options: GenerateOptions = {}): unknown {
  const state = createState(options);
  return generateNode(schema, createContext(state.rng, 0), state, 0);
}

/**
 * Produces `count` records. A root array schema is unwrapped so the count applies to its
 * items, which matches the common case of pasting a sample list response.
 */
export function generateRecords(schema: JsonSchema, count: number, options: GenerateOptions = {}): unknown[] {
  const state = createState(options);
  const itemSchema = recordSchema(schema);
  const safeCount = Math.max(0, Math.min(Math.floor(count), 10_000));
  return Array.from({ length: safeCount }, (_, i) => generateNode(itemSchema, createContext(state.rng, i), state, 0));
}

export function recordSchema(schema: JsonSchema): JsonSchema {
  const isArray = schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'));
  return isArray && schema.items ? schema.items : schema;
}
