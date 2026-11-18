import type { KeyValue } from '../types.ts';

export interface RequestSpec {
  method: string;
  url: string;
  headers: KeyValue[];
  body: string;
  multipart?: KeyValue[];
}

export function shellQuote(value: string): string {
  if (value === '') return "''";
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const BODYLESS = new Set(['GET', 'HEAD']);

export function multipartFields(spec: RequestSpec): KeyValue[] {
  if (BODYLESS.has(spec.method.toUpperCase())) return [];
  return spec.multipart?.filter((field) => field.enabled && field.key) ?? [];
}

export function requestHeaderEntries(headers: KeyValue[], useMultipart: boolean): [string, string][] {
  return headers
    .filter((h) => h.enabled && h.key.trim() && (!useMultipart || h.key.trim().toLowerCase() !== 'content-type'))
    .map((h) => [h.key.trim(), h.value]);
}

export function toCurl(spec: RequestSpec): string {
  const lines = [`curl ${shellQuote(spec.url)}`];
  const method = spec.method.toUpperCase();
  const fields = multipartFields(spec);
  const hasBody = (spec.body !== '' || fields.length > 0) && !BODYLESS.has(method);
  if (method === 'HEAD') lines.push('--head');
  else if (method !== 'GET' && !(method === 'POST' && hasBody)) lines.push(`-X ${method}`);
  for (const [key, value] of requestHeaderEntries(spec.headers, fields.length > 0)) {
    lines.push(`-H ${shellQuote(`${key}: ${value}`)}`);
  }
  if (fields.length) {
    for (const { key, value } of fields) lines.push(`--form-string ${shellQuote(`${key}=${value}`)}`);
  } else if (hasBody) lines.push(`--data-raw ${shellQuote(spec.body)}`);
  return lines.join(' \\\n  ');
}

export function toFetch(spec: RequestSpec): string {
  const method = spec.method.toUpperCase();
  const fields = multipartFields(spec);
  const headers = Object.fromEntries(requestHeaderEntries(spec.headers, fields.length > 0));
  const form: string[] = [];
  const init: string[] = [`  method: ${JSON.stringify(method)},`];
  if (Object.keys(headers).length > 0) init.push(`  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},`);
  if (fields.length) {
    form.push('const body = new FormData();');
    for (const { key, value } of fields) form.push(`body.append(${JSON.stringify(key)}, ${JSON.stringify(value)});`);
    form.push('');
    init.push('  body,');
  } else if (spec.body && !BODYLESS.has(method)) init.push(`  body: ${JSON.stringify(spec.body)},`);
  return `${form.join('\n')}const response = await fetch(${JSON.stringify(spec.url)}, {\n${init.join('\n')}\n});\nconst data = await response.json();`;
}
