import type { JsonSchema, JsonSchemaType } from './types.ts';

export type FieldPath = (string | '[]')[];

export interface SchemaField {
  path: FieldPath;
  label: string;
  depth: number;
  type: string;
  schema: JsonSchema;
}

function primaryType(schema: JsonSchema): string {
  if (Array.isArray(schema.type)) {
    const concrete = schema.type.filter((t) => t !== 'null');
    const nullable = concrete.length !== schema.type.length;
    return `${concrete.join(' | ') || 'null'}${nullable ? '?' : ''}`;
  }
  if (schema.enum) return 'enum';
  return schema.type ?? 'any';
}

function hasType(schema: JsonSchema, type: JsonSchemaType): boolean {
  return Array.isArray(schema.type) ? schema.type.includes(type) : schema.type === type;
}

/** Flattens a schema into a depth-annotated list of leaf and container fields for editing. */
export function listFields(schema: JsonSchema): SchemaField[] {
  const fields: SchemaField[] = [];
  const walk = (node: JsonSchema, path: FieldPath, depth: number) => {
    if ((hasType(node, 'object') || node.properties) && node.properties) {
      for (const [key, child] of Object.entries(node.properties)) {
        const childPath = [...path, key];
        fields.push({ path: childPath, label: key, depth, type: primaryType(child), schema: child });
        walk(child, childPath, depth + 1);
      }
    } else if (hasType(node, 'array') && node.items) {
      const items = node.items;
      if (items.properties) walk(items, [...path, '[]'], depth);
    }
  };
  walk(schema.type === 'array' && schema.items ? schema.items : schema, schema.type === 'array' ? ['[]'] : [], 0);
  return fields;
}

export function pathToString(path: FieldPath): string {
  return path.reduce<string>((acc, part) => (part === '[]' ? `${acc}[]` : acc ? `${acc}.${part}` : part), '');
}

/** Returns a structurally-shared copy of `schema` with the node at `path` patched. */
export function updateField(schema: JsonSchema, path: FieldPath, patch: (node: JsonSchema) => JsonSchema): JsonSchema {
  if (path.length === 0) return patch(schema);
  const [head, ...rest] = path as [string, ...FieldPath];
  if (head === '[]') {
    if (!schema.items) return schema;
    return { ...schema, items: updateField(schema.items, rest, patch) };
  }
  const child = schema.properties?.[head];
  if (!child) return schema;
  return { ...schema, properties: { ...schema.properties, [head]: updateField(child, rest, patch) } };
}
