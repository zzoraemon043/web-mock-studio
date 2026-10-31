import { compilePattern } from '../router/match.ts';
import { generateRecords } from '../schema/generate.ts';
import type { DataTemplate, MockRule } from '../types.ts';
import { LATENCY_PROFILES, toResponseHeaders } from '../mock/network.ts';

const TOKEN_RE = /\{\{\s*([\w.$-]+)\s*\}\}/g;

function mswPath(rule: MockRule): string {
  const compiled = compilePattern(rule.pattern);
  const path = compiled.segments
    .map((s) => (s.kind === 'static' ? s.value : s.kind === 'param' ? `:${s.name}${s.optional ? '?' : ''}` : '*'))
    .join('/');
  return `${compiled.origin ?? ''}/${path}`;
}

function tokenToExpression(expr: string): string | null {
  const [root, ...path] = expr.split('.');
  const key = path.join('.');
  switch (root) {
    case 'params':
      return `String(params[${JSON.stringify(key)}] ?? '')`;
    case 'query':
      return `String(url.searchParams.get(${JSON.stringify(key)}) ?? '')`;
    case 'headers':
      return `String(request.headers.get(${JSON.stringify(key)}) ?? '')`;
    case 'request':
      return path[0] === 'method' ? 'request.method' : path[0] === 'path' ? 'url.pathname' : 'request.url';
    case 'now':
      return path[0] === 'unix' ? 'Math.floor(Date.now() / 1000)' : 'new Date().toISOString()';
    case 'timestamp':
      return 'Date.now()';
    case 'faker':
      return path[0] === 'uuid' ? 'crypto.randomUUID()' : null;
    default:
      return null;
  }
}

function templateLiteral(body: string): { code: string; usesBody: boolean } {
  let usesBody = false;
  let out = '';
  let last = 0;
  for (const m of body.matchAll(TOKEN_RE)) {
    out += body.slice(last, m.index).replace(/[`\\]|\$\{/g, (c) => `\\${c}`);
    const expr = m[1] ?? '';
    if (expr.startsWith('body.')) {
      usesBody = true;
      out += `\${String(json?.${expr.slice(5).split('.').map((k) => `[${JSON.stringify(k)}]`).join('?.')} ?? '')}`;
    } else {
      const js = tokenToExpression(expr);
      out += js ? `\${${js}}` : m[0].replace(/[`\\]|\$\{/g, (c) => `\\${c}`);
    }
    last = (m.index ?? 0) + m[0].length;
  }
  out += body.slice(last).replace(/[`\\]|\$\{/g, (c) => `\\${c}`);
  return { code: `\`${out}\``, usesBody };
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => (line ? pad + line : line)).join('\n');
}

function delayFor(rule: MockRule): number {
  const { latency, customDelayMs } = rule.network;
  return latency === 'custom' ? customDelayMs : LATENCY_PROFILES[latency].baseMs;
}

function handlerFor(rule: MockRule, templates: readonly DataTemplate[], datasetVars: Map<string, string>): string {
  const method = rule.method === 'ANY' ? 'all' : rule.method.toLowerCase();
  const lines: string[] = [];
  const headers = toResponseHeaders(rule.response.headers, false);
  const ms = delayFor(rule);
  if (ms > 0) lines.push(`await delay(${ms});`);

  if (rule.network.failureRate > 0 && rule.network.failureOutcomes.length > 0) {
    lines.push(`if (Math.random() * 100 < ${rule.network.failureRate}) {`);
    lines.push(`  const outcome = pick(${JSON.stringify(rule.network.failureOutcomes)});`);
    lines.push(`  if (outcome === 'network-error') return HttpResponse.error();`);
    lines.push(`  return HttpResponse.json({ error: 'Injected failure', status: outcome }, { status: outcome });`);
    lines.push('}');
  }

  const init = `{ status: ${rule.response.status}${Object.keys(headers).length ? `, headers: ${JSON.stringify(headers)}` : ''} }`;
  const template = templates.find((t) => t.id === rule.response.dataset.templateId);

  if (rule.response.bodyMode === 'dataset' && template) {
    const variable = datasetVars.get(`${template.id}:${rule.response.dataset.count}`) ?? 'dataset';
    if (rule.response.dataset.envelope === 'paginated') {
      lines.push('const url = new URL(request.url);');
      lines.push(`const page = Math.max(1, Number(url.searchParams.get('page')) || 1);`);
      lines.push(`const pageSize = Math.max(1, Number(url.searchParams.get('pageSize') ?? url.searchParams.get('limit')) || 10);`);
      lines.push(`const data = ${variable}.slice((page - 1) * pageSize, page * pageSize);`);
      lines.push(`return HttpResponse.json({ data, page, pageSize, total: ${variable}.length, totalPages: Math.ceil(${variable}.length / pageSize) }, ${init});`);
    } else if (rule.response.dataset.envelope === 'item') {
      lines.push('const key = String(Object.values(params).at(-1) ?? \'\');');
      lines.push(`const record = ${variable}.find((r) => String(r.id) === key) ?? ${variable}[Number(key) - 1];`);
      lines.push(`if (!record) return HttpResponse.json({ error: 'Not Found' }, { status: 404 });`);
      lines.push(`return HttpResponse.json(record, ${init});`);
    } else {
      lines.push(`return HttpResponse.json(${variable}, ${init});`);
    }
  } else {
    const { code, usesBody } = templateLiteral(rule.response.body);
    if (code.includes('url.')) lines.unshift('const url = new URL(request.url);');
    if (usesBody) lines.unshift('const json = await request.clone().json().catch(() => null);');
    const contentType = Object.keys(headers).some((h) => h.toLowerCase() === 'content-type');
    const merged = contentType ? init : `{ status: ${rule.response.status}, headers: ${JSON.stringify({ 'Content-Type': 'application/json', ...headers })} }`;
    lines.push(`return new HttpResponse(${code}, ${merged});`);
  }

  return `  // ${rule.name.replace(/\n/g, ' ')}\n  http.${method}(${JSON.stringify(mswPath(rule))}, async ({ request, params }) => {\n${indent(lines.join('\n'), 4)}\n  }),`;
}

/** Emits an MSW v2 handlers module. Dataset rules are snapshotted so the output has no runtime dependency on this tool. */
export function generateMswHandlers(rules: readonly MockRule[], templates: readonly DataTemplate[]): string {
  const active = rules.filter((r) => r.enabled && r.pattern);
  const datasetVars = new Map<string, string>();
  const datasetDecls: string[] = [];
  for (const rule of active) {
    if (rule.response.bodyMode !== 'dataset') continue;
    const template = templates.find((t) => t.id === rule.response.dataset.templateId);
    if (!template) continue;
    const key = `${template.id}:${rule.response.dataset.count}`;
    if (datasetVars.has(key)) continue;
    const base = template.name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('') || 'dataset';
    const name = `${/^\d/.test(base) ? `_${base}` : base}Records${datasetVars.size || ''}`;
    datasetVars.set(key, name);
    const records = generateRecords(template.schema, rule.response.dataset.count, { seed: `${template.id}:${template.updatedAt}` });
    datasetDecls.push(`const ${name} = ${JSON.stringify(records, null, 2)};`);
  }
  const needsPick = active.some((r) => r.network.failureRate > 0 && r.network.failureOutcomes.length > 0);
  const handlers = active.map((r) => handlerFor(r, templates, datasetVars));
  return [
    '// Generated by Web Mock Studio. Requires msw@2.',
    "import { http, HttpResponse, delay } from 'msw';",
    '',
    ...(needsPick ? ['const pick = (items) => items[Math.floor(Math.random() * items.length)];', ''] : []),
    ...datasetDecls.flatMap((d) => [d, '']),
    'export const handlers = [',
    handlers.join('\n\n'),
    '];',
    '',
  ].join('\n');
}
