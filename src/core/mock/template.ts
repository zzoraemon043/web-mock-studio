import { createContext, fake } from '../faker/faker.ts';
import { isFakerKind } from '../faker/kinds.ts';
import type { Rng } from '../random.ts';

export interface TemplateScope {
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  method: string;
  url: URL;
  now: number;
  rng: Rng;
}

const TOKEN_RE = /\{\{\s*([\w.$-]+)\s*\}\}/g;

function readPath(source: unknown, path: string[]): unknown {
  let node = source;
  for (const key of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function resolveToken(expr: string, scope: TemplateScope): unknown {
  const [root, ...path] = expr.split('.');
  switch (root) {
    case 'params':
      return readPath(scope.params, path);
    case 'query':
      return readPath(scope.query, path);
    case 'headers':
      return readPath(scope.headers, path.map((p) => p.toLowerCase()));
    case 'body':
      return readPath(scope.body, path);
    case 'request':
      if (path[0] === 'method') return scope.method;
      if (path[0] === 'url') return scope.url.href;
      if (path[0] === 'path') return scope.url.pathname;
      return undefined;
    case 'now':
      return path[0] === 'unix' ? Math.floor(scope.now / 1000) : new Date(scope.now).toISOString();
    case 'timestamp':
      return scope.now;
    case 'faker': {
      const kind = path[0];
      return isFakerKind(kind) ? fake(kind, createContext(scope.rng, 0, scope.now)) : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Replaces `{{ expr }}` tokens. Strings are inserted JSON-escaped (without quotes) so a
 * token is safe both inside a JSON string literal and as a bare numeric value; objects
 * are inserted as JSON. Unknown tokens are left untouched so typos stay visible.
 */
export function interpolate(template: string, scope: TemplateScope): string {
  return template.replace(TOKEN_RE, (whole, expr: string) => {
    const value = resolveToken(expr, scope);
    if (value === undefined) return whole;
    if (typeof value === 'string') return JSON.stringify(value).slice(1, -1);
    return JSON.stringify(value);
  });
}

export const TEMPLATE_TOKENS = [
  '{{params.id}}',
  '{{query.page}}',
  '{{headers.authorization}}',
  '{{body.email}}',
  '{{request.method}}',
  '{{now}}',
  '{{timestamp}}',
  '{{faker.uuid}}',
  '{{faker.fullName}}',
  '{{faker.email}}',
] as const;
