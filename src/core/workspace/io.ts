import { DEFAULT_NETWORK, DEFAULT_SETTINGS, createId } from '../defaults.ts';
import { isFakerKind } from '../faker/kinds.ts';
import type { JsonSchema } from '../schema/types.ts';
import {
  HTTP_METHODS,
  type DataTemplate,
  type DatasetEnvelope,
  type FailureOutcome,
  type HttpMethod,
  type KeyValue,
  type LatencyProfile,
  type MockRule,
  type QueryMatcher,
  type RuleMethod,
  type SavedRequest,
  type ThemeMode,
  type WorkspaceData,
  type WorkspaceSettings,
} from '../types.ts';

export const WORKSPACE_FORMAT = 'web-mock-studio/workspace';
export const WORKSPACE_VERSION = 1;

export interface WorkspaceFile extends WorkspaceData {
  format: typeof WORKSPACE_FORMAT;
  version: number;
  exportedAt: string;
}

export function serializeWorkspace(data: WorkspaceData, now = new Date()): string {
  const file: WorkspaceFile = {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    exportedAt: now.toISOString(),
    rules: data.rules,
    templates: data.templates,
    requests: data.requests,
    settings: data.settings,
  };
  return JSON.stringify(file, null, 2);
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;

const LATENCIES: readonly LatencyProfile[] = ['none', 'fast-4g', '4g', '3g', 'slow-3g', 'custom'];
const ENVELOPES: readonly DatasetEnvelope[] = ['array', 'paginated', 'item'];
const THEMES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const QUERY_MODES = ['equals', 'present', 'absent', 'regex'] as const;
const FAILURES: readonly FailureOutcome[] = [400, 401, 403, 404, 429, 500, 502, 503, 'network-error'];

function keyValues(v: unknown): KeyValue[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((h) => ({ key: str(h.key), value: str(h.value), enabled: bool(h.enabled, true) }));
}

function queryMatchers(v: unknown): QueryMatcher[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((q) => ({ key: str(q.key), value: str(q.value), mode: oneOf(q.mode, QUERY_MODES, 'equals') }));
}

function sanitizeSchema(v: unknown, depth = 0): JsonSchema {
  if (!isObj(v) || depth > 32) return {};
  const out: JsonSchema = { ...(v as JsonSchema) };
  if (out['x-faker'] !== undefined && !isFakerKind(out['x-faker'])) delete out['x-faker'];
  if (isObj(v.properties)) {
    out.properties = Object.fromEntries(Object.entries(v.properties).map(([k, child]) => [k, sanitizeSchema(child, depth + 1)]));
  }
  if (v.items !== undefined) out.items = sanitizeSchema(v.items, depth + 1);
  return out;
}

function normalizeRule(v: Obj, warnings: string[], index: number): MockRule {
  const response = isObj(v.response) ? v.response : {};
  const dataset = isObj(response.dataset) ? response.dataset : {};
  const network = isObj(v.network) ? v.network : {};
  const pattern = str(v.pattern);
  if (!pattern) warnings.push(`Rule #${index + 1} has no pattern.`);
  const failures = Array.isArray(network.failureOutcomes)
    ? network.failureOutcomes.filter((f): f is FailureOutcome => (FAILURES as readonly unknown[]).includes(f))
    : [...DEFAULT_NETWORK.failureOutcomes];
  const now = Date.now();
  return {
    id: str(v.id) || createId('rule'),
    name: str(v.name, 'Imported rule'),
    enabled: bool(v.enabled, true),
    method: oneOf<RuleMethod>(v.method, [...HTTP_METHODS, 'ANY'], 'GET'),
    pattern,
    query: queryMatchers(v.query),
    response: {
      status: Math.min(599, Math.max(200, Math.round(num(response.status, 200)))),
      headers: keyValues(response.headers),
      bodyMode: response.bodyMode === 'dataset' ? 'dataset' : 'inline',
      body: str(response.body),
      dataset: {
        templateId: str(dataset.templateId),
        count: Math.min(10_000, Math.max(0, Math.round(num(dataset.count, 25)))),
        envelope: oneOf(dataset.envelope, ENVELOPES, 'array'),
      },
    },
    network: {
      latency: oneOf(network.latency, LATENCIES, 'none'),
      customDelayMs: Math.max(0, num(network.customDelayMs, DEFAULT_NETWORK.customDelayMs)),
      jitterMs: Math.max(0, num(network.jitterMs, 0)),
      failureRate: Math.min(100, Math.max(0, num(network.failureRate, 0))),
      failureOutcomes: failures,
    },
    createdAt: num(v.createdAt, now),
    updatedAt: num(v.updatedAt, now),
  };
}

function normalizeTemplate(v: Obj): DataTemplate {
  const now = Date.now();
  return {
    id: str(v.id) || createId('tpl'),
    name: str(v.name, 'Imported template'),
    sample: str(v.sample),
    schema: sanitizeSchema(v.schema),
    createdAt: num(v.createdAt, now),
    updatedAt: num(v.updatedAt, now),
  };
}

function normalizeRequest(v: Obj): SavedRequest {
  return {
    id: str(v.id) || createId('req'),
    name: str(v.name, 'Imported request'),
    method: oneOf<HttpMethod>(v.method, HTTP_METHODS, 'GET'),
    url: str(v.url),
    headers: keyValues(v.headers),
    body: str(v.body),
    createdAt: num(v.createdAt, Date.now()),
  };
}

function normalizeSettings(v: unknown): WorkspaceSettings {
  const s = isObj(v) ? v : {};
  return {
    theme: oneOf(s.theme, THEMES, DEFAULT_SETTINGS.theme),
    interceptionEnabled: bool(s.interceptionEnabled, DEFAULT_SETTINGS.interceptionEnabled),
    passthroughUnmatched: bool(s.passthroughUnmatched, DEFAULT_SETTINGS.passthroughUnmatched),
    logLimit: Math.min(5000, Math.max(10, Math.round(num(s.logLimit, DEFAULT_SETTINGS.logLimit)))),
  };
}

export type ParseWorkspaceResult = { ok: true; data: WorkspaceData; warnings: string[] } | { ok: false; error: string };

/**
 * Imports are treated as untrusted input: every field is type-checked and clamped, unknown
 * fields are dropped, and missing fields get defaults, so files from older or newer
 * versions load without corrupting persisted state.
 */
export function parseWorkspace(text: string): ParseWorkspaceResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isObj(raw)) return { ok: false, error: 'Workspace file must be a JSON object.' };
  if (raw.format !== undefined && raw.format !== WORKSPACE_FORMAT) return { ok: false, error: `Unrecognized format "${String(raw.format)}".` };
  const version = num(raw.version, WORKSPACE_VERSION);
  const warnings: string[] = [];
  if (version > WORKSPACE_VERSION) warnings.push(`File version ${version} is newer than supported version ${WORKSPACE_VERSION}; unknown fields were ignored.`);
  if (!Array.isArray(raw.rules) && !Array.isArray(raw.templates) && !Array.isArray(raw.requests)) {
    return { ok: false, error: 'File contains no rules, templates or requests.' };
  }
  const rules = (Array.isArray(raw.rules) ? raw.rules : []).filter(isObj).map((r, i) => normalizeRule(r, warnings, i));
  const templates = (Array.isArray(raw.templates) ? raw.templates : []).filter(isObj).map(normalizeTemplate);
  const requests = (Array.isArray(raw.requests) ? raw.requests : []).filter(isObj).map(normalizeRequest);

  const templateIds = new Set(templates.map((t) => t.id));
  for (const rule of rules) {
    if (rule.response.bodyMode === 'dataset' && !templateIds.has(rule.response.dataset.templateId)) {
      warnings.push(`Rule "${rule.name}" references a missing dataset template.`);
    }
  }
  return { ok: true, data: { rules, templates, requests, settings: normalizeSettings(raw.settings) }, warnings };
}

export type MergeMode = 'replace' | 'merge';

/** Merge keeps local items and lets incoming items with the same id win. */
export function mergeWorkspace(current: WorkspaceData, incoming: WorkspaceData, mode: MergeMode): WorkspaceData {
  if (mode === 'replace') return { ...incoming, settings: { ...incoming.settings, theme: current.settings.theme } };
  const mergeById = <T extends { id: string }>(a: T[], b: T[]): T[] => {
    const map = new Map(a.map((item) => [item.id, item]));
    for (const item of b) map.set(item.id, item);
    return [...map.values()];
  };
  return {
    rules: mergeById(current.rules, incoming.rules),
    templates: mergeById(current.templates, incoming.templates),
    requests: mergeById(current.requests, incoming.requests),
    settings: current.settings,
  };
}
