import { describe, expect, it } from 'vitest';
import { createRule, createTemplate, DEFAULT_NETWORK } from '../defaults.ts';
import { createRng } from '../random.ts';
import type { InterceptedRequest, MockDecision, MockRule } from '../types.ts';
import { computeDelay, pickFailure } from './network.ts';
import { resolveRequest, type ResolveContext } from './resolve.ts';

const req = (method: string, path: string, body: string | null = null, headers: Record<string, string> = {}): InterceptedRequest => ({
  method,
  url: `http://localhost:5173${path}`,
  headers,
  body,
});

const template = createTemplate('User', JSON.stringify([{ id: 1, name: 'Ada', email: 'ada@x.dev' }]));

function ctx(rules: MockRule[], overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    rules,
    templates: [template],
    settings: { interceptionEnabled: true, passthroughUnmatched: true },
    rng: createRng(1),
    now: Date.UTC(2026, 9, 15),
    ...overrides,
  };
}

function respond(decision: MockDecision) {
  if (decision.kind !== 'respond') throw new Error(`expected respond, got ${decision.kind}`);
  return decision;
}

describe('resolveRequest', () => {
  it('passes through when disabled or unmatched', () => {
    const rules = [createRule({ pattern: '/api/a' })];
    expect(resolveRequest(req('GET', '/api/a'), ctx(rules, { settings: { interceptionEnabled: false, passthroughUnmatched: true } }))).toEqual({ kind: 'passthrough', reason: 'disabled' });
    expect(resolveRequest(req('GET', '/api/b'), ctx(rules))).toEqual({ kind: 'passthrough', reason: 'no-match' });
  });

  it('returns 404 for unmatched requests in strict mode', () => {
    const decision = respond(resolveRequest(req('GET', '/nope'), ctx([], { settings: { interceptionEnabled: true, passthroughUnmatched: false } })));
    expect(decision.status).toBe(404);
  });

  it('interpolates params, query, headers and request body', () => {
    const rule = createRule({
      method: 'POST',
      pattern: '/api/users/:id',
      response: {
        ...createRule().response,
        status: 201,
        body: '{"id": {{params.id}}, "q": "{{query.q}}", "auth": "{{headers.Authorization}}", "email": "{{body.user.email}}", "at": "{{now}}", "keep": "{{unknown.x}}"}',
      },
    });
    const decision = respond(resolveRequest(req('POST', '/api/users/42?q=a%22b', '{"user":{"email":"x@y.z"}}', { Authorization: 'Bearer t' }), ctx([rule])));
    expect(decision.status).toBe(201);
    expect(decision.headers['content-type']).toBe('application/json');
    expect(decision.headers['x-mocked-by']).toBe('web-mock-studio');
    expect(JSON.parse(decision.body ?? '')).toEqual({ id: 42, q: 'a"b', auth: 'Bearer t', email: 'x@y.z', at: '2026-10-15T00:00:00.000Z', keep: '{{unknown.x}}' });
  });

  it('serves paginated datasets from a stable collection', () => {
    const rule = createRule({ pattern: '/api/users', response: { ...createRule().response, bodyMode: 'dataset', dataset: { templateId: template.id, count: 23, envelope: 'paginated' } } });
    const page1 = JSON.parse(respond(resolveRequest(req('GET', '/api/users?page=1&pageSize=10'), ctx([rule]))).body ?? '');
    const page3 = JSON.parse(respond(resolveRequest(req('GET', '/api/users?page=3&pageSize=10'), ctx([rule], { rng: createRng(99) }))).body ?? '');
    expect(page1).toMatchObject({ page: 1, pageSize: 10, total: 23, totalPages: 3 });
    expect(page1.data).toHaveLength(10);
    expect(page3.data).toHaveLength(3);
    expect(page3.data[0].id).toBe(21);
  });

  it('looks up dataset items by id and returns 404 when absent', () => {
    const rule = createRule({ pattern: '/api/users/:id', response: { ...createRule().response, bodyMode: 'dataset', dataset: { templateId: template.id, count: 5, envelope: 'item' } } });
    expect(JSON.parse(respond(resolveRequest(req('GET', '/api/users/4'), ctx([rule]))).body ?? '').id).toBe(4);
    expect(respond(resolveRequest(req('GET', '/api/users/99'), ctx([rule]))).status).toBe(404);
  });

  it('reports a misconfigured dataset binding as 500', () => {
    const rule = createRule({ response: { ...createRule().response, bodyMode: 'dataset', dataset: { templateId: 'missing', count: 1, envelope: 'array' } } });
    expect(respond(resolveRequest(req('GET', '/api/resource'), ctx([rule]))).status).toBe(500);
  });

  it('omits bodies for HEAD and null-body statuses', () => {
    expect(respond(resolveRequest(req('HEAD', '/api/resource'), ctx([createRule({ method: 'ANY' })]))).body).toBeNull();
    const noContent = createRule({ response: { ...createRule().response, status: 204 } });
    expect(respond(resolveRequest(req('GET', '/api/resource'), ctx([noContent]))).body).toBeNull();
  });

  it('injects failures at the configured rate', () => {
    const rule = createRule({ network: { ...DEFAULT_NETWORK, failureRate: 100, failureOutcomes: [503] } });
    const decision = respond(resolveRequest(req('GET', '/api/resource'), ctx([rule])));
    expect(decision).toMatchObject({ status: 503, injected: true });
    const offline = createRule({ network: { ...DEFAULT_NETWORK, failureRate: 100, failureOutcomes: ['network-error'] } });
    expect(resolveRequest(req('GET', '/api/resource'), ctx([offline])).kind).toBe('network-error');
  });
});

describe('network simulation', () => {
  it('computes latency within jitter bounds', () => {
    const rng = createRng(5);
    expect(computeDelay({ ...DEFAULT_NETWORK, latency: 'none', jitterMs: 500 }, rng)).toBe(0);
    for (let i = 0; i < 100; i++) {
      const d = computeDelay({ ...DEFAULT_NETWORK, latency: '3g', jitterMs: 100 }, rng);
      expect(d).toBeGreaterThanOrEqual(550);
      expect(d).toBeLessThanOrEqual(750);
    }
    expect(computeDelay({ ...DEFAULT_NETWORK, latency: 'custom', customDelayMs: 10_000_000 }, rng)).toBe(60_000);
  });

  it('approximates the failure rate', () => {
    const rng = createRng(6);
    const network = { ...DEFAULT_NETWORK, failureRate: 30, failureOutcomes: [500 as const] };
    let failures = 0;
    for (let i = 0; i < 5000; i++) if (pickFailure(network, rng) !== null) failures++;
    expect(failures / 5000).toBeGreaterThan(0.26);
    expect(failures / 5000).toBeLessThan(0.34);
    expect(pickFailure({ ...network, failureOutcomes: [] }, rng)).toBeNull();
  });
});
