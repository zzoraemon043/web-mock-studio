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
  /** Remaining node budget; once spent, arrays collapse to empty so nested minItems cannot blow up. */
  budget: number;
}

const MAX_ITEMS = 1000;
const MAX_STRING = 10_000;
const NODE_BUDGET = 20_000;
const TOTAL_BUDGET = 5_000_000;

const asObject = (v: unknown): JsonSchema => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as JsonSchema) : {});

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
  if (typeof schema.maxLength === 'number' && out.length > schema.maxLength) out = out.slice(0, Math.max(0, schema.maxLength));
  if (typeof schema.minLength === 'number') {
    const target = Math.min(schema.minLength, MAX_STRING);
    if (out.length < target) out += 'x'.repeat(target - out.length);
  }
  return out;
}

function fakeWithRange(kind: FakerKind, ctx: FakerContext, schema: JsonSchema): unknown {
  return fake(kind, { ...ctx, min: schema.minimum, max: schema.maximum });
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

interface Bounds {
  min?: number;
  max?: number;
}

/** Folds minimum/exclusiveMinimum (draft 4 boolean or draft 6+ number form) into inclusive bounds. */
function numericBounds(schema: JsonSchema, integer: boolean): Bounds {
  const step = integer ? 1 : 0.01;
  let min = isNum(schema.minimum) ? schema.minimum : undefined;
  let max = isNum(schema.maximum) ? schema.maximum : undefined;
  if (isNum(schema.exclusiveMinimum)) min = min === undefined ? schema.exclusiveMinimum + step : Math.max(min, schema.exclusiveMinimum + step);
  else if (schema.exclusiveMinimum === true && min !== undefined) min += step;
  if (isNum(schema.exclusiveMaximum)) max = max === undefined ? schema.exclusiveMaximum - step : Math.min(max, schema.exclusiveMaximum - step);
  else if (schema.exclusiveMaximum === true && max !== undefined) max -= step;
  if (integer) {
    if (min !== undefined) min = Math.ceil(min);
    if (max !== undefined) max = Math.floor(max);
  }
  return { min, max };
}

function snapToMultiple(value: number, multipleOf: number, { min, max }: Bounds): number {
  let out = Math.round(value / multipleOf) * multipleOf;
  if (min !== undefined && out < min) out += Math.ceil((min - out) / multipleOf - 1e-9) * multipleOf;
  if (max !== undefined && out > max) out -= Math.ceil((out - max) / multipleOf - 1e-9) * multipleOf;
  const decimals = Math.min(10, (String(multipleOf).split('.')[1] ?? '').length);
  return Number(out.toFixed(decimals));
}

function generateNumber(kind: FakerKind | undefined, ctx: FakerContext, schema: JsonSchema, integer: boolean): number {
  const { min, max } = numericBounds(schema, integer);
  const call = (k: FakerKind): unknown => fake(k, { ...ctx, min, max });
  const raw = kind ? call(kind) : undefined;
  let value = isNum(raw) ? raw : (call(integer ? 'integer' : 'float') as number);
  if (integer) value = Math.round(value);
  if (isNum(schema.multipleOf) && schema.multipleOf > 0) value = snapToMultiple(value, schema.multipleOf, { min, max });
  if (min !== undefined && value < min) value = min;
  if (max !== undefined && value > max) value = max;
  return value;
}

function generateNode(input: JsonSchema, ctx: FakerContext, state: State, depth: number): unknown {
  const schema = asObject(input);
  state.budget -= 1;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return state.rng.pick(schema.enum);

  const type = resolveType(schema, state);
  const kind = schema['x-faker'];

  switch (type) {
    case 'null':
    case undefined:
      return null;
    case 'boolean':
      return state.rng.bool();
    case 'integer':
    case 'number':
      return generateNumber(kind, ctx, schema, type === 'integer');
    case 'string': {
      const resolved = kind ?? (schema.format ? FORMAT_KINDS[schema.format] : undefined) ?? 'word';
      return clampString(String(fakeWithRange(resolved, ctx, schema)), schema);
    }
    case 'array': {
      if (depth >= state.maxDepth || !schema.items || state.budget <= 0) return [];
      const clamp = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(MAX_ITEMS, Math.max(0, n)) : fallback);
      const min = clamp(schema.minItems, 1);
      const max = Math.max(min, clamp(schema.maxItems, Math.max(min, 5)));
      const length = state.rng.int(min, max);
      const out: unknown[] = [];
      for (let i = 0; i < length && state.budget > 0; i++) out.push(generateNode(schema.items, childContext(ctx, i, schema.items), state, depth + 1));
      return out;
    }
    case 'object': {
      if (depth >= state.maxDepth) return {};
      const required = new Set(Array.isArray(schema.required) ? schema.required : []);
      const out: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(asObject(schema.properties))) {
        if (!required.has(key) && !state.rng.bool(state.optionalRate)) continue;
        Object.defineProperty(out, key, { value: generateNode(prop, ctx, state, depth + 1), enumerable: true, writable: true, configurable: true });
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
    budget: NODE_BUDGET,
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
  let total = TOTAL_BUDGET;
  return Array.from({ length: safeCount }, (_, i) => {
    state.budget = Math.min(NODE_BUDGET, total);
    const start = state.budget;
    const record = generateNode(itemSchema, createContext(state.rng, i), state, 0);
    total -= start - state.budget;
    return record;
  });
}

export function recordSchema(schema: JsonSchema): JsonSchema {
  const isArray = schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'));
  return isArray && schema.items ? schema.items : schema;
}
