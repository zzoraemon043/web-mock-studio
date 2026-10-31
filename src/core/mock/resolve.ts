import { looksLikeJson } from '../curl/parse.ts';
import { createRng, hashSeed, type Rng } from '../random.ts';
import { findMatchingRule, type RuleMatch } from '../router/match.ts';
import { generateRecords } from '../schema/generate.ts';
import type { DataTemplate, InterceptedRequest, MockDecision, MockRule, WorkspaceSettings } from '../types.ts';
import { computeDelay, isNullBodyStatus, pickFailure, statusText, toResponseHeaders } from './network.ts';
import { interpolate } from './template.ts';

export interface ResolveContext {
  rules: readonly MockRule[];
  templates: readonly DataTemplate[];
  settings: Pick<WorkspaceSettings, 'interceptionEnabled' | 'passthroughUnmatched'>;
  rng?: Rng;
  now?: number;
}

export const MOCK_HEADER = 'x-mocked-by';

function parseBody(body: string | null): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function positiveInt(value: string | null | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Dataset records are seeded from the template identity, not the request, so every
 * page and every detail lookup is cut from the same stable collection.
 */
function datasetBody(rule: MockRule, template: DataTemplate, match: RuleMatch, url: URL): { status?: number; body: unknown } {
  const { count, envelope } = rule.response.dataset;
  const records = generateRecords(template.schema, count, { seed: `${template.id}:${template.updatedAt}` });

  if (envelope === 'paginated') {
    const page = positiveInt(url.searchParams.get('page'), 1);
    const pageSize = positiveInt(url.searchParams.get('pageSize') ?? url.searchParams.get('per_page') ?? url.searchParams.get('limit'), 10);
    const start = (page - 1) * pageSize;
    return {
      body: {
        data: records.slice(start, start + pageSize),
        page,
        pageSize,
        total: records.length,
        totalPages: Math.max(1, Math.ceil(records.length / pageSize)),
      },
    };
  }

  if (envelope === 'item') {
    const key = Object.values(match.params).at(-1);
    if (key === undefined) return { body: records[0] ?? null };
    const byId = records.find((r) => r && typeof r === 'object' && String((r as Record<string, unknown>).id) === key);
    if (byId) return { body: byId };
    const asIndex = Number.parseInt(key, 10);
    if (String(asIndex) === key && asIndex >= 1 && asIndex <= records.length) return { body: records[asIndex - 1] };
    return { status: 404, body: { error: 'Not Found', message: `No record matches "${key}"` } };
  }

  return { body: records };
}

function errorBody(status: number): string {
  return JSON.stringify({ error: statusText(status) || 'Error', status, message: 'Injected by Web Mock Studio failure simulation' });
}

export function resolveRequest(request: InterceptedRequest, ctx: ResolveContext): MockDecision {
  if (!ctx.settings.interceptionEnabled) return { kind: 'passthrough', reason: 'disabled' };

  const match = findMatchingRule(ctx.rules, request.method, request.url);
  if (!match) {
    if (ctx.settings.passthroughUnmatched) return { kind: 'passthrough', reason: 'no-match' };
    return {
      kind: 'respond',
      ruleId: '',
      status: 404,
      headers: { 'content-type': 'application/json', [MOCK_HEADER]: 'web-mock-studio; strict' },
      body: JSON.stringify({ error: 'Not Found', message: `No mock rule matches ${request.method} ${request.url}` }),
      delayMs: 0,
      injected: false,
    };
  }

  const { rule } = match;
  const now = ctx.now ?? Date.now();
  const rng = ctx.rng ?? createRng(hashSeed(`${now}:${Math.random()}`));
  const delayMs = computeDelay(rule.network, rng);
  const failure = pickFailure(rule.network, rng);

  if (failure === 'network-error') return { kind: 'network-error', ruleId: rule.id, delayMs };

  const headers = toResponseHeaders(rule.response.headers);
  headers[MOCK_HEADER] = 'web-mock-studio';

  if (failure !== null) {
    headers['content-type'] = 'application/json';
    return { kind: 'respond', ruleId: rule.id, status: failure, headers, body: errorBody(failure), delayMs, injected: true };
  }

  const url = new URL(request.url);
  let status = rule.response.status;
  let body: string;

  if (rule.response.bodyMode === 'dataset') {
    const template = ctx.templates.find((t) => t.id === rule.response.dataset.templateId);
    if (!template) {
      status = 500;
      body = JSON.stringify({ error: 'Mock misconfigured', message: 'The dataset template bound to this rule no longer exists.' });
    } else {
      const result = datasetBody(rule, template, match, url);
      if (result.status) status = result.status;
      body = JSON.stringify(result.body, null, 2);
    }
    headers['content-type'] ??= 'application/json';
  } else {
    body = interpolate(rule.response.body, {
      params: match.params,
      query: match.query,
      headers: Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v])),
      body: parseBody(request.body),
      method: request.method.toUpperCase(),
      url,
      now,
      rng,
    });
    if (!headers['content-type']) headers['content-type'] = looksLikeJson(body) ? 'application/json' : 'text/plain; charset=utf-8';
  }

  const omitBody = request.method.toUpperCase() === 'HEAD' || isNullBodyStatus(status);
  return { kind: 'respond', ruleId: rule.id, status, headers, body: omitBody ? null : body, delayMs, injected: false };
}
