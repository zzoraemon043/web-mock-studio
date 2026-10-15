import { inferSchema } from './schema/infer.ts';
import type { DataTemplate, MockRule, NetworkSimulation, SavedRequest, WorkspaceData, WorkspaceSettings } from './types.ts';

export function createId(prefix = ''): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${uuid.replace(/-/g, '').slice(0, 12)}` : uuid;
}

export const DEFAULT_NETWORK: NetworkSimulation = {
  latency: 'none',
  customDelayMs: 500,
  jitterMs: 0,
  failureRate: 0,
  failureOutcomes: [500, 'network-error'],
};

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  theme: 'system',
  interceptionEnabled: true,
  passthroughUnmatched: true,
  logLimit: 200,
};

export function createRule(partial: Partial<MockRule> = {}): MockRule {
  const now = Date.now();
  return {
    id: createId('rule'),
    name: 'Untitled rule',
    enabled: true,
    method: 'GET',
    pattern: '/api/resource',
    query: [],
    response: {
      status: 200,
      headers: [],
      bodyMode: 'inline',
      body: '{\n  "ok": true\n}',
      dataset: { templateId: '', count: 25, envelope: 'array' },
    },
    network: { ...DEFAULT_NETWORK, failureOutcomes: [...DEFAULT_NETWORK.failureOutcomes] },
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createTemplate(name: string, sample: string): DataTemplate {
  const now = Date.now();
  let schema;
  try {
    schema = inferSchema(JSON.parse(sample), name);
  } catch {
    schema = inferSchema({}, name);
  }
  return { id: createId('tpl'), name, sample, schema, createdAt: now, updatedAt: now };
}

export function createSavedRequest(partial: Partial<SavedRequest> = {}): SavedRequest {
  return {
    id: createId('req'),
    name: 'Untitled request',
    method: 'GET',
    url: '',
    headers: [],
    body: '',
    createdAt: Date.now(),
    ...partial,
  };
}

const USER_SAMPLE = `[
  {
    "id": 1,
    "name": "Ada Lovelace",
    "email": "ada@analytical.dev",
    "avatarUrl": "https://example.com/a.png",
    "role": "admin",
    "status": "active",
    "company": "Analytical Engines",
    "address": { "city": "London", "country": "United Kingdom", "zipCode": "10115" },
    "loginCount": 42,
    "createdAt": "2025-11-02T09:15:00Z"
  }
]`;

/** First-run workspace: demonstrates dataset pagination, param lookup, templating and failure injection. */
export function createStarterWorkspace(): WorkspaceData {
  const users = createTemplate('User', USER_SAMPLE);
  const rules: MockRule[] = [
    createRule({
      name: 'List users (paginated)',
      pattern: '/api/users',
      response: {
        status: 200,
        headers: [],
        bodyMode: 'dataset',
        body: '',
        dataset: { templateId: users.id, count: 48, envelope: 'paginated' },
      },
      network: { ...DEFAULT_NETWORK, latency: '4g', jitterMs: 60 },
    }),
    createRule({
      name: 'Get user by id',
      pattern: '/api/users/:id',
      response: {
        status: 200,
        headers: [],
        bodyMode: 'dataset',
        body: '',
        dataset: { templateId: users.id, count: 48, envelope: 'item' },
      },
    }),
    createRule({
      name: 'Login',
      method: 'POST',
      pattern: '/api/auth/login',
      response: {
        status: 200,
        headers: [{ key: 'Cache-Control', value: 'no-store', enabled: true }],
        bodyMode: 'inline',
        body: '{\n  "token": "{{faker.token}}",\n  "user": "{{body.email}}",\n  "issuedAt": "{{now}}"\n}',
        dataset: { templateId: '', count: 10, envelope: 'array' },
      },
      network: { ...DEFAULT_NETWORK, latency: '3g', jitterMs: 150, failureRate: 25, failureOutcomes: [401, 429] },
    }),
    createRule({
      name: 'Flaky health check',
      pattern: '/api/health',
      response: {
        status: 200,
        headers: [],
        bodyMode: 'inline',
        body: '{\n  "status": "ok",\n  "checkedAt": {{timestamp}}\n}',
        dataset: { templateId: '', count: 10, envelope: 'array' },
      },
      network: { ...DEFAULT_NETWORK, latency: 'slow-3g', jitterMs: 400, failureRate: 40, failureOutcomes: [500, 503, 'network-error'] },
    }),
  ];
  return {
    rules,
    templates: [users],
    requests: [
      createSavedRequest({ name: 'Page 2 of users', url: '/api/users?page=2&pageSize=5' }),
      createSavedRequest({ name: 'User 7', url: '/api/users/7' }),
      createSavedRequest({
        name: 'Login',
        method: 'POST',
        url: '/api/auth/login',
        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
        body: '{\n  "email": "qa@example.com",\n  "password": "hunter2"\n}',
      }),
    ],
    settings: { ...DEFAULT_SETTINGS },
  };
}
