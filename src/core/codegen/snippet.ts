import { compilePattern, patternToRegExpSource } from '../router/match.ts';
import { generateRecords } from '../schema/generate.ts';
import { createContext, fake } from '../faker/faker.ts';
import { isFakerKind } from '../faker/kinds.ts';
import { createRng } from '../random.ts';
import { LATENCY_PROFILES } from '../mock/network.ts';
import type { DataTemplate, MockRule } from '../types.ts';

export interface SnippetRule {
  name: string;
  method: string;
  origin: string | null;
  regex: string;
  query: { key: string; value: string; mode: string }[];
  status: number;
  headers: Record<string, string>;
  body: string | null;
  records: unknown[] | null;
  envelope: string;
  delay: number;
  jitter: number;
  failureRate: number;
  failures: (number | string)[];
  specificity: number;
}

/**
 * Self-contained runtime injected into third-party pages. It is plain ES2017 so it can be
 * pasted into a console or loaded with a script tag without a build step, and it patches
 * both fetch and XMLHttpRequest so axios and other XHR-based clients are covered.
 */
const RUNTIME = String.raw`
  var TOKEN = /\{\{\s*([\w.$-]+)\s*\}\}/g;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var originalFetch = window.fetch.bind(window);

  function read(obj, path) {
    return path.reduce(function (n, k) { return n && typeof n === 'object' ? n[k] : undefined; }, obj);
  }

  function interpolate(text, scope) {
    return text.replace(TOKEN, function (whole, expr) {
      var parts = expr.split('.'), root = parts.shift(), value;
      if (root === 'params' || root === 'query' || root === 'body') value = read(scope[root], parts);
      else if (root === 'headers') value = scope.headers[(parts[0] || '').toLowerCase()];
      else if (root === 'now') value = parts[0] === 'unix' ? Math.floor(Date.now() / 1000) : new Date().toISOString();
      else if (root === 'timestamp') value = Date.now();
      else if (root === 'request') value = parts[0] === 'method' ? scope.method : parts[0] === 'path' ? scope.url.pathname : scope.url.href;
      else if (root === 'faker' && parts[0] === 'uuid' && window.crypto && crypto.randomUUID) value = crypto.randomUUID();
      if (value === undefined) return whole;
      return typeof value === 'string' ? JSON.stringify(value).slice(1, -1) : JSON.stringify(value);
    });
  }

  function queryOk(q, sp) {
    return q.every(function (m) {
      var values = sp.getAll(m.key);
      if (m.mode === 'present') return values.length > 0;
      if (m.mode === 'absent') return values.length === 0;
      if (m.mode === 'regex') { try { var re = new RegExp(m.value); return values.some(function (v) { return re.test(v); }); } catch (e) { return false; } }
      return values.indexOf(m.value) >= 0;
    });
  }

  function match(method, rawUrl) {
    var url = new URL(rawUrl, location.href), best = null;
    RULES.forEach(function (rule) {
      if (rule.method !== 'ANY' && rule.method !== method) return;
      if (rule.origin && rule.origin !== url.origin.toLowerCase()) return;
      var m = new RegExp(rule.regex).exec(url.pathname);
      if (!m || !queryOk(rule.query, url.searchParams)) return;
      if (!best || rule.specificity > best.rule.specificity) best = { rule: rule, params: m.groups || {}, url: url };
    });
    return best;
  }

  function resolve(method, rawUrl, headers, bodyText) {
    var hit = match(method, rawUrl);
    if (!hit) return null;
    var rule = hit.rule, url = hit.url, status = rule.status, body;
    var delay = Math.max(0, rule.delay + (rule.jitter ? Math.round((Math.random() * 2 - 1) * rule.jitter) : 0));
    var out = { delay: delay, headers: Object.assign({ 'x-mocked-by': 'web-mock-studio' }, rule.headers) };
    if (rule.failureRate > 0 && rule.failures.length && Math.random() * 100 < rule.failureRate) {
      var f = pick(rule.failures);
      if (f === 'network-error') { out.networkError = true; return out; }
      out.status = f; out.headers['content-type'] = 'application/json';
      out.body = JSON.stringify({ error: 'Injected failure', status: f });
      return out;
    }
    if (rule.records) {
      var recs = rule.records, sp = url.searchParams;
      if (rule.envelope === 'paginated') {
        var page = Math.max(1, parseInt(sp.get('page'), 10) || 1);
        var size = Math.max(1, parseInt(sp.get('pageSize') || sp.get('per_page') || sp.get('limit'), 10) || 10);
        body = { data: recs.slice((page - 1) * size, page * size), page: page, pageSize: size, total: recs.length, totalPages: Math.max(1, Math.ceil(recs.length / size)) };
      } else if (rule.envelope === 'item') {
        var key = Object.keys(hit.params).map(function (k) { return hit.params[k]; })[0];
        body = recs.filter(function (r) { return r && String(r.id) === key; })[0] || recs[parseInt(key, 10) - 1];
        if (!body) { status = 404; body = { error: 'Not Found' }; }
      } else body = recs;
      out.body = JSON.stringify(body);
      out.headers['content-type'] = out.headers['content-type'] || 'application/json';
    } else {
      var parsed; try { parsed = JSON.parse(bodyText || ''); } catch (e) { parsed = bodyText; }
      out.body = interpolate(rule.body || '', { params: hit.params, query: Object.fromEntries(url.searchParams), headers: headers, body: parsed, method: method, url: url });
      if (!out.headers['content-type']) out.headers['content-type'] = /^\s*[[{]/.test(out.body) ? 'application/json' : 'text/plain';
    }
    out.status = status;
    if (method === 'HEAD' || [101, 103, 204, 205, 304].indexOf(status) >= 0) out.body = null;
    return out;
  }

  window.fetch = function (input, init) {
    var req = input instanceof Request ? new Request(input, init) : new Request(new URL(String(input), location.href).href, init);
    var headers = {};
    req.headers.forEach(function (v, k) { headers[k] = v; });
    var bodyPromise = req.method === 'GET' || req.method === 'HEAD' ? Promise.resolve('') : req.clone().text();
    return bodyPromise.then(function (bodyText) {
      var res = resolve(req.method, req.url, headers, bodyText);
      if (!res) return originalFetch(input, init);
      return sleep(res.delay).then(function () {
        if (res.networkError) throw new TypeError('Failed to fetch (simulated by Web Mock Studio)');
        return new Response(res.body, { status: res.status, headers: res.headers });
      });
    });
  };

  var XHR = window.XMLHttpRequest;
  if (XHR) {
    var open = XHR.prototype.open, send = XHR.prototype.send, setHeader = XHR.prototype.setRequestHeader;
    XHR.prototype.open = function (method, url) {
      this.__wms = { method: String(method).toUpperCase(), url: String(url), headers: {} };
      return open.apply(this, arguments);
    };
    XHR.prototype.setRequestHeader = function (k, v) {
      if (this.__wms) this.__wms.headers[k.toLowerCase()] = v;
      return setHeader.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      var meta = this.__wms, xhr = this;
      var res = meta && resolve(meta.method, meta.url, meta.headers, typeof body === 'string' ? body : '');
      if (!res) return send.apply(this, arguments);
      var define = function (k, v) { Object.defineProperty(xhr, k, { configurable: true, get: function () { return v; } }); };
      var fire = function (type) { xhr.dispatchEvent(new ProgressEvent(type)); };
      setTimeout(function () {
        if (res.networkError) { define('readyState', 4); define('status', 0); fire('readystatechange'); fire('error'); fire('loadend'); return; }
        var text = res.body || '';
        var headerText = Object.keys(res.headers).map(function (k) { return k + ': ' + res.headers[k]; }).join('\r\n');
        define('readyState', 4); define('status', res.status); define('statusText', '');
        define('responseURL', new URL(meta.url, location.href).href);
        define('responseText', text);
        define('response', xhr.responseType === 'json' ? (function () { try { return JSON.parse(text); } catch (e) { return null; } })() : text);
        xhr.getAllResponseHeaders = function () { return headerText; };
        xhr.getResponseHeader = function (k) { var v = res.headers[String(k).toLowerCase()]; return v === undefined ? null : v; };
        fire('readystatechange'); fire('load'); fire('loadend');
      }, res.delay);
    };
  }
  console.info('[web-mock-studio] ' + RULES.length + ' mock rule(s) active');
`;

function delayFor(rule: MockRule): number {
  const { latency, customDelayMs } = rule.network;
  return latency === 'custom' ? customDelayMs : LATENCY_PROFILES[latency].baseMs;
}

function resolveStaticFakerTokens(body: string, seed: string): string {
  const rng = createRng(seed);
  return body.replace(/\{\{\s*faker\.(\w+)\s*\}\}/g, (whole, kind: string) => {
    if (kind === 'uuid' || !isFakerKind(kind)) return whole;
    const value = fake(kind, createContext(rng, 0));
    return typeof value === 'string' ? JSON.stringify(value).slice(1, -1) : JSON.stringify(value);
  });
}

export function toSnippetRules(rules: readonly MockRule[], templates: readonly DataTemplate[]): SnippetRule[] {
  return rules
    .filter((r) => r.enabled && r.pattern && !compilePattern(r.pattern).error)
    .map((rule) => {
      const compiled = compilePattern(rule.pattern);
      const template = rule.response.bodyMode === 'dataset' ? templates.find((t) => t.id === rule.response.dataset.templateId) : undefined;
      const query = [...compiled.impliedQuery, ...rule.query.filter((q) => q.key)];
      const specificity =
        (compiled.origin ? 100 : 0) +
        compiled.segments.reduce((sum, s) => sum + (s.kind === 'static' ? 10 : s.kind === 'param' ? 5 : 1), 0) +
        query.length * 3 +
        (rule.method === 'ANY' ? 0 : 1);
      return {
        name: rule.name,
        method: rule.method,
        origin: compiled.origin,
        regex: patternToRegExpSource(rule.pattern),
        query,
        status: rule.response.status,
        headers: Object.fromEntries(rule.response.headers.filter((h) => h.enabled && h.key).map((h) => [h.key.toLowerCase(), h.value])),
        body: template ? null : resolveStaticFakerTokens(rule.response.body, rule.id),
        records: template ? generateRecords(template.schema, rule.response.dataset.count, { seed: `${template.id}:${template.updatedAt}` }) : null,
        envelope: rule.response.dataset.envelope,
        delay: delayFor(rule),
        jitter: rule.network.latency === 'none' ? 0 : rule.network.jitterMs,
        failureRate: rule.network.failureRate,
        failures: rule.network.failureOutcomes,
        specificity,
      };
    });
}

export function generateInterceptorSnippet(rules: readonly MockRule[], templates: readonly DataTemplate[]): string {
  const data = JSON.stringify(toSnippetRules(rules, templates), null, 2).replace(/<\/script/gi, '<\\/script');
  return `/* Web Mock Studio standalone interceptor. Load before your app code. */\n(function () {\n  'use strict';\n  if (window.__WEB_MOCK_STUDIO__) return;\n  window.__WEB_MOCK_STUDIO__ = true;\n  var RULES = ${data.replace(/\n/g, '\n  ')};\n${RUNTIME}})();\n`;
}
