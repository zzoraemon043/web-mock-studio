import type { KeyValue } from '../types.ts';

export interface RequestSpec {
  method: string;
  url: string;
  headers: KeyValue[];
  body: string;
}

export function shellQuote(value: string): string {
  if (value === '') return "''";
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const BODYLESS = new Set(['GET', 'HEAD']);

export function toCurl(spec: RequestSpec): string {
  const lines = [`curl ${shellQuote(spec.url)}`];
  const method = spec.method.toUpperCase();
  const hasBody = spec.body !== '' && !BODYLESS.has(method);
  if (method === 'HEAD') lines.push('--head');
  else if (method !== 'GET' && !(method === 'POST' && hasBody)) lines.push(`-X ${method}`);
  for (const h of spec.headers) {
    if (h.enabled && h.key.trim()) lines.push(`-H ${shellQuote(`${h.key.trim()}: ${h.value}`)}`);
  }
  if (hasBody) lines.push(`--data-raw ${shellQuote(spec.body)}`);
  return lines.join(' \\\n  ');
}

export function toFetch(spec: RequestSpec): string {
  const method = spec.method.toUpperCase();
  const headers = Object.fromEntries(spec.headers.filter((h) => h.enabled && h.key.trim()).map((h) => [h.key.trim(), h.value]));
  const init: string[] = [`  method: ${JSON.stringify(method)},`];
  if (Object.keys(headers).length > 0) init.push(`  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},`);
  if (spec.body && !BODYLESS.has(method)) init.push(`  body: ${JSON.stringify(spec.body)},`);
  return `const response = await fetch(${JSON.stringify(spec.url)}, {\n${init.join('\n')}\n});\nconst data = await response.json();`;
}
