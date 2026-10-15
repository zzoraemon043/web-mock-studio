import type { FakerKind } from '../faker/kinds.ts';

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

/**
 * Subset of JSON Schema 2020-12 that inference produces and generation understands.
 * `x-faker` is a vendor extension carrying the semantic generator chosen for a field.
 */
export interface JsonSchema {
  $schema?: string;
  title?: string;
  type?: JsonSchemaType | JsonSchemaType[];
  format?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  examples?: unknown[];
  'x-faker'?: FakerKind;
}
