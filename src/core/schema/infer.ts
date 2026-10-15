import { detectKind, detectStringFormat, tokenizeKey } from '../faker/semantic.ts';
import type { FakerKind } from '../faker/kinds.ts';
import type { JsonSchema, JsonSchemaType } from './types.ts';

export const SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

const SAMPLE_CAP = 1000;

/**
 * Inference runs in two passes. `observe` folds every sample into a Shape that keeps
 * raw observations (lengths, numbers, strings, key presence counts); `toSchema` then
 * derives constraints from the aggregate. Folding first is what makes `required`,
 * numeric ranges and enum detection correct across heterogeneous array elements.
 */
interface Shape {
  seen: number;
  nulls: number;
  booleans: number;
  numbers: number[];
  allIntegers: boolean;
  strings: string[];
  arrays: { lengths: number[]; items: Shape } | null;
  objects: { count: number; props: Map<string, Shape>; presence: Map<string, number> } | null;
}

function emptyShape(): Shape {
  return { seen: 0, nulls: 0, booleans: 0, numbers: [], allIntegers: true, strings: [], arrays: null, objects: null };
}

function observe(shape: Shape, value: unknown): void {
  shape.seen++;
  if (value === null || value === undefined) {
    shape.nulls++;
  } else if (typeof value === 'boolean') {
    shape.booleans++;
  } else if (typeof value === 'number') {
    if (shape.numbers.length < SAMPLE_CAP) shape.numbers.push(value);
    if (!Number.isInteger(value)) shape.allIntegers = false;
  } else if (typeof value === 'string') {
    if (shape.strings.length < SAMPLE_CAP) shape.strings.push(value);
  } else if (Array.isArray(value)) {
    shape.arrays ??= { lengths: [], items: emptyShape() };
    shape.arrays.lengths.push(value.length);
    for (const item of value) observe(shape.arrays.items, item);
  } else if (typeof value === 'object') {
    shape.objects ??= { count: 0, props: new Map(), presence: new Map() };
    shape.objects.count++;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      let prop = shape.objects.props.get(key);
      if (!prop) {
        prop = emptyShape();
        shape.objects.props.set(key, prop);
      }
      observe(prop, child);
      shape.objects.presence.set(key, (shape.objects.presence.get(key) ?? 0) + 1);
    }
  }
}

const VOCABULARIES: readonly string[][] = [
  ['active', 'inactive', 'pending', 'suspended', 'archived'],
  ['draft', 'published', 'scheduled', 'archived'],
  ['open', 'in_progress', 'resolved', 'closed'],
  ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
  ['low', 'medium', 'high', 'critical'],
  ['owner', 'admin', 'editor', 'member', 'viewer', 'guest'],
  ['free', 'pro', 'team', 'enterprise'],
  ['success', 'failed', 'pending'],
  ['male', 'female', 'other'],
];

const CATEGORICAL_KEYS = new Set(['status', 'state', 'role', 'type', 'kind', 'level', 'priority', 'plan', 'tier', 'gender', 'category', 'stage', 'severity']);

const NON_CATEGORICAL_KINDS = new Set<FakerKind>([
  'uuid', 'objectId', 'fullName', 'firstName', 'lastName', 'username', 'email', 'token', 'url', 'avatar', 'sentence', 'paragraph',
]);

function matchVocabulary(sample: string): string[] | undefined {
  const lower = sample.toLowerCase();
  const vocab = VOCABULARIES.find((list) => list.includes(lower));
  if (!vocab) return undefined;
  if (sample === sample.toUpperCase()) return vocab.map((v) => v.toUpperCase());
  if (sample.charAt(0) === sample.charAt(0).toUpperCase()) return vocab.map((v) => v.charAt(0).toUpperCase() + v.slice(1));
  return [...vocab];
}

function stringSchema(strings: string[], key: string | undefined): JsonSchema {
  const schema: JsonSchema = { type: 'string' };
  const formats = new Set(strings.map(detectStringFormat));
  const format = formats.size === 1 ? [...formats][0] : undefined;
  if (format && format !== 'color') schema.format = format;

  const kind = detectKind(key, strings[0] ?? '');
  const distinct = [...new Set(strings)];
  const isCategoricalKey = key ? tokenizeKey(key).some((t) => CATEGORICAL_KEYS.has(t)) : false;

  if (!format && (!kind || !NON_CATEGORICAL_KINDS.has(kind))) {
    if (strings.length >= 4 && distinct.length <= 6 && distinct.length * 2 <= strings.length) {
      schema.enum = distinct;
      return schema;
    }
    const vocab = distinct.length === 1 && strings[0] ? matchVocabulary(strings[0]) : undefined;
    if (vocab) {
      schema.enum = vocab;
      return schema;
    }
    if (isCategoricalKey && distinct.length <= 3 && distinct.length > 1) {
      schema.enum = distinct;
      return schema;
    }
  }
  if (kind) schema['x-faker'] = kind;
  return schema;
}

const UNBOUNDED_NUMERIC_KINDS = new Set<FakerKind>(['sequence', 'latitude', 'longitude', 'unixSeconds', 'unixMillis']);

function numberSchema(numbers: number[], allIntegers: boolean, key: string | undefined): JsonSchema {
  const schema: JsonSchema = { type: allIntegers ? 'integer' : 'number' };
  const kind = detectKind(key, numbers[0] ?? 0);
  if (kind) schema['x-faker'] = kind;
  if (kind && UNBOUNDED_NUMERIC_KINDS.has(kind)) return schema;

  let min = Math.min(...numbers);
  let max = Math.max(...numbers);
  if (min === max) {
    // A single observation says little about range; widen symmetrically around zero-anchored bounds.
    const magnitude = Math.abs(min) || 10;
    min = min >= 0 ? 0 : min * 2;
    max = max >= 0 ? Math.max(max * 2, magnitude) : 0;
  }
  if (kind === 'percentage') {
    min = Math.max(0, min);
    max = Math.min(100, Math.max(max, 100));
  }
  schema.minimum = allIntegers ? Math.floor(min) : min;
  schema.maximum = allIntegers ? Math.ceil(max) : max;
  return schema;
}

function arraySchema(arrays: NonNullable<Shape['arrays']>, key: string | undefined): JsonSchema {
  const schema: JsonSchema = { type: 'array' };
  const items = arrays.items.seen > 0 ? toSchema(arrays.items, singularize(key)) : {};
  schema.items = items;
  const minLen = Math.min(...arrays.lengths);
  const maxLen = Math.max(...arrays.lengths);
  if (arrays.items.seen === 0) {
    schema.minItems = 0;
    schema.maxItems = 0;
  } else if (minLen === maxLen) {
    schema.minItems = Math.max(1, Math.floor(minLen / 2));
    schema.maxItems = Math.max(minLen, 3);
  } else {
    schema.minItems = minLen;
    schema.maxItems = maxLen;
  }
  return schema;
}

function objectSchema(objects: NonNullable<Shape['objects']>): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [key, prop] of objects.props) {
    properties[key] = toSchema(prop, key);
    if ((objects.presence.get(key) ?? 0) === objects.count) required.push(key);
  }
  return { type: 'object', properties, required };
}

function singularize(key: string | undefined): string | undefined {
  if (!key) return key;
  if (/ies$/i.test(key)) return key.replace(/ies$/i, 'y');
  if (/(ss|us)$/i.test(key)) return key;
  return key.replace(/s$/i, '');
}

function toSchema(shape: Shape, key: string | undefined): JsonSchema {
  const variants: JsonSchema[] = [];
  if (shape.objects) variants.push(objectSchema(shape.objects));
  if (shape.arrays) variants.push(arraySchema(shape.arrays, key));
  if (shape.strings.length > 0) variants.push(stringSchema(shape.strings, key));
  if (shape.numbers.length > 0) variants.push(numberSchema(shape.numbers, shape.allIntegers, key));
  if (shape.booleans > 0) variants.push({ type: 'boolean' });

  if (variants.length === 0) return { type: 'null' };

  const [primary, ...rest] = variants as [JsonSchema, ...JsonSchema[]];
  const types: JsonSchemaType[] = [primary.type as JsonSchemaType, ...rest.map((v) => v.type as JsonSchemaType)];
  if (shape.nulls > 0) types.push('null');
  if (types.length > 1) primary.type = types;
  return primary;
}

export function inferSchema(sample: unknown, title?: string): JsonSchema {
  const shape = emptyShape();
  observe(shape, sample);
  const schema = toSchema(shape, undefined);
  return { $schema: SCHEMA_DIALECT, ...(title ? { title } : {}), ...schema };
}

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

export function parseJson(text: string): ParseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
