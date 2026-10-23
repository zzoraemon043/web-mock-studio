import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRule, createStarterWorkspace, DEFAULT_NETWORK } from '../defaults.ts';
import { generateMswHandlers } from './msw.ts';
import { generateInterceptorSnippet } from './snippet.ts';

describe('generateMswHandlers', () => {
  it('emits one handler per enabled rule with snapshotted datasets', () => {
    const { rules, templates } = createStarterWorkspace();
    const code = generateMswHandlers([...rules, createRule({ enabled: false, pattern: '/disabled' })], templates);
    expect(code).toContain("import { http, HttpResponse, delay } from 'msw';");
    expect(code).toContain('http.get("/api/users", async');
    expect(code).toContain('http.get("/api/users/:id", async');
    expect(code).toContain('http.post("/api/auth/login", async');
    expect(code).toContain('const userRecords = [');
    expect(code).not.toContain('/disabled');
    expect(code).toContain("json?.[\"email\"]");
  });

  it('emits valid identifiers and item lookups for nested routes', () => {
    const { templates } = createStarterWorkspace();
    const template = { ...templates[0]!, name: '2024 Orders' };
    const rule = createRule({ pattern: '/api/users/:userId/orders/:id', response: { ...createRule().response, bodyMode: 'dataset', dataset: { templateId: template.id, count: 3, envelope: 'item' } } });
    const code = generateMswHandlers([rule], [template]);
    expect(code).toContain('const _2024OrdersRecords = [');
    expect(code).toContain('Object.values(params).at(-1)');
  });

  it('escapes template literal metacharacters', () => {
    const rule = createRule({ response: { ...createRule().response, body: '`${x}` {{params.id}}' } });
    expect(generateMswHandlers([rule], [])).toContain('\\`\\${x}\\` ${String(params["id"] ?? \'\')}');
  });
});

describe('generateInterceptorSnippet', () => {
  const realFetch = vi.fn(async () => new Response('real'));

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).location;
  });

  function install(code: string) {
    const win = { fetch: realFetch, crypto: globalThis.crypto } as unknown as Window & typeof globalThis;
    Object.assign(globalThis, { window: win, location: { href: 'http://localhost:3000/' } });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    new Function(code)();
    return win;
  }

  it('produces a runnable script that mocks matching fetch calls', async () => {
    const { templates } = createStarterWorkspace();
    const rules = [
      createRule({ pattern: '/api/items/:id', response: { ...createRule().response, body: '{"id":"{{params.id}}","q":"{{query.q}}"}' } }),
      createRule({ pattern: '/api/users', response: { ...createRule().response, bodyMode: 'dataset', dataset: { templateId: templates[0]?.id ?? '', count: 12, envelope: 'paginated' } } }),
      createRule({ pattern: '/api/down', network: { ...DEFAULT_NETWORK, failureRate: 100, failureOutcomes: ['network-error'] } }),
    ];
    const win = install(generateInterceptorSnippet(rules, templates));

    const item = await win.fetch('/api/items/7?q=x');
    expect(item.headers.get('x-mocked-by')).toBe('web-mock-studio');
    expect(await item.json()).toEqual({ id: '7', q: 'x' });

    const page = await (await win.fetch('/api/users?page=2&pageSize=5')).json();
    expect(page).toMatchObject({ page: 2, pageSize: 5, total: 12, totalPages: 3 });
    expect(page.data).toHaveLength(5);

    await expect(win.fetch('/api/down')).rejects.toThrow(TypeError);

    expect(await (await win.fetch('/elsewhere')).text()).toBe('real');
    expect(realFetch).toHaveBeenCalledTimes(1);
  });
});
