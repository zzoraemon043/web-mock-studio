import type { MockRule, QueryMatcher } from '../types.ts';

type Segment =
  | { kind: 'static'; value: string }
  | { kind: 'param'; name: string; optional: boolean }
  | { kind: 'wildcard' };

export interface CompiledPattern {
  source: string;
  origin: string | null;
  segments: Segment[];
  impliedQuery: QueryMatcher[];
  error?: string;
}

export interface RouteMatch {
  params: Record<string, string>;
  query: Record<string, string>;
  score: number;
}

const ABSOLUTE_URL_RE = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)(.*)$/i;
const PARAM_RE = /^:([A-Za-z_$][\w$]*)(\?)?$/;
const BRACE_PARAM_RE = /^\{([A-Za-z_$][\w$-]*)\}$/;

const cache = new Map<string, CompiledPattern>();

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Accepts Express-style (`/users/:id`, `/files/:name?`, `/assets/*`), OpenAPI-style
 * (`/users/{id}`) and absolute URL patterns. A query string inside the pattern is
 * lifted into equality matchers so `/search?type=user` reads naturally.
 */
export function compilePattern(pattern: string): CompiledPattern {
  const cached = cache.get(pattern);
  if (cached) return cached;

  let rest = pattern.trim();
  let origin: string | null = null;
  const impliedQuery: QueryMatcher[] = [];
  let error: string | undefined;

  const hashIndex = rest.indexOf('#');
  if (hashIndex >= 0) rest = rest.slice(0, hashIndex);

  const absolute = ABSOLUTE_URL_RE.exec(rest);
  if (absolute?.[1]) {
    try {
      origin = new URL(absolute[1]).origin.toLowerCase();
      rest = absolute[2] || '/';
    } catch {
      error = 'Invalid absolute URL';
    }
  }

  const queryIndex = rest.search(/\?(?!\/|$)/);
  if (queryIndex >= 0) {
    const params = new URLSearchParams(rest.slice(queryIndex + 1));
    for (const [key, value] of params) impliedQuery.push({ key, value, mode: value === '' ? 'present' : 'equals' });
    rest = rest.slice(0, queryIndex);
  }

  const segments: Segment[] = [];
  const parts = rest.split('/').filter(Boolean);
  parts.forEach((part, i) => {
    const param = PARAM_RE.exec(part) ?? BRACE_PARAM_RE.exec(part);
    if (part === '*' || part === '**') {
      if (i !== parts.length - 1) error ??= 'Wildcard must be the last segment';
      segments.push({ kind: 'wildcard' });
    } else if (param?.[1]) {
      segments.push({ kind: 'param', name: param[1], optional: param[2] === '?' });
    } else {
      segments.push({ kind: 'static', value: safeDecode(part) });
    }
  });

  const compiled: CompiledPattern = { source: pattern, origin, segments, impliedQuery, ...(error ? { error } : {}) };
  if (cache.size > 500) cache.clear();
  cache.set(pattern, compiled);
  return compiled;
}

export function matchPath(compiled: CompiledPattern, pathname: string): Record<string, string> | null {
  const parts = pathname.split('/').filter(Boolean).map(safeDecode);
  const { segments } = compiled;

  // Backtracking walk so an optional param followed by static segments
  // (`/files/:name?/edit`) can give its slot back when the path is shorter.
  const walk = (si: number, pi: number): Record<string, string> | null => {
    const segment = segments[si];
    if (!segment) return pi === parts.length ? {} : null;
    if (segment.kind === 'wildcard') return { '*': parts.slice(pi).join('/') };
    const part = parts[pi];
    if (segment.kind === 'static') return part === segment.value ? walk(si + 1, pi + 1) : null;
    if (part !== undefined) {
      const rest = walk(si + 1, pi + 1);
      if (rest) return { [segment.name]: part, ...rest };
    }
    if (!segment.optional) return null;
    return walk(si + 1, pi);
  };

  return walk(0, 0);
}

function safeRegex(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}

export function matchQuery(matchers: QueryMatcher[], search: URLSearchParams): boolean {
  return matchers.every((m) => {
    if (!m.key) return true;
    const values = search.getAll(m.key);
    switch (m.mode) {
      case 'present':
        return values.length > 0;
      case 'absent':
        return values.length === 0;
      case 'equals':
        return values.includes(m.value);
      case 'regex': {
        const re = safeRegex(m.value);
        return re !== null && values.some((v) => re.test(v));
      }
    }
  });
}

/**
 * Specificity score: static segments outrank params, params outrank wildcards, a pinned
 * origin and each query condition add weight. The highest score wins, so a generic
 * `/api/*` fallback never shadows `/api/users/:id` regardless of list order.
 */
function scorePattern(compiled: CompiledPattern, queryCount: number, methodSpecific: boolean): number {
  let score = compiled.origin ? 100 : 0;
  for (const s of compiled.segments) score += s.kind === 'static' ? 10 : s.kind === 'param' ? 5 : 1;
  return score + queryCount * 3 + (methodSpecific ? 1 : 0);
}

export function matchRoute(pattern: string, url: URL, extraQuery: QueryMatcher[] = []): RouteMatch | null {
  const compiled = compilePattern(pattern);
  if (compiled.error) return null;
  if (compiled.origin && compiled.origin !== url.origin.toLowerCase()) return null;
  const params = matchPath(compiled, url.pathname);
  if (!params) return null;
  const matchers = [...compiled.impliedQuery, ...extraQuery.filter((q) => q.key)];
  if (!matchQuery(matchers, url.searchParams)) return null;
  return {
    params,
    query: Object.fromEntries(url.searchParams),
    score: scorePattern(compiled, matchers.length, false),
  };
}

export interface RuleMatch extends RouteMatch {
  rule: MockRule;
}

export function findMatchingRule(rules: readonly MockRule[], method: string, rawUrl: string, base?: string): RuleMatch | null {
  let url: URL;
  try {
    url = new URL(rawUrl, base);
  } catch {
    return null;
  }
  const upper = method.toUpperCase();
  let best: RuleMatch | null = null;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.method !== 'ANY' && rule.method !== upper) continue;
    const match = matchRoute(rule.pattern, url, rule.query);
    if (!match) continue;
    const score = match.score + (rule.method !== 'ANY' ? 1 : 0);
    if (!best || score > best.score) best = { ...match, score, rule };
  }
  return best;
}

export function describePattern(pattern: string): { params: string[]; error?: string } {
  const compiled = compilePattern(pattern);
  const params = compiled.segments.flatMap((s) => (s.kind === 'param' ? [s.name] : s.kind === 'wildcard' ? ['*'] : []));
  return { params, ...(compiled.error ? { error: compiled.error } : {}) };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

const GROUP_NAME_RE = /^[A-Za-z_$][\w$]*$/;

/**
 * Names of the capture groups emitted by `patternToRegExpSource`, in order. Brace params
 * may contain `-` (`{user-id}`), which is not a legal regex group name, so those groups
 * are emitted unnamed and callers map them back by position.
 */
export function patternCaptureNames(pattern: string): string[] {
  return compilePattern(pattern).segments.flatMap((s) => (s.kind === 'param' ? [s.name] : s.kind === 'wildcard' ? ['wildcard'] : []));
}

/**
 * Compiles a path pattern to an anchored RegExp source with named groups, used by code
 * generators so exported snippets need no router runtime. Origin and query conditions
 * are not encoded here; callers check them separately.
 */
export function patternToRegExpSource(pattern: string): string {
  const compiled = compilePattern(pattern);
  const seen = new Set<string>();
  const group = (name: string) => {
    if (seen.has(name) || !GROUP_NAME_RE.test(name)) return '';
    seen.add(name);
    return `?<${name}>`;
  };
  let source = '';
  for (const segment of compiled.segments) {
    if (segment.kind === 'static') source += `\\/${escapeRegex(encodeURI(segment.value))}`;
    else if (segment.kind === 'param') source += segment.optional ? `(?:\\/(${group(segment.name)}[^/]+))?` : `\\/(${group(segment.name)}[^/]+)`;
    else source += `(?:\\/(${group('wildcard')}.*))?`;
  }
  return `^${source || ''}\\/?$`;
}
