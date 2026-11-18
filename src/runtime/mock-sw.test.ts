import { describe, expect, it, vi } from 'vitest';
import workerScript from '../../public/mock-sw.js?raw';
import { resolveRequest } from '../core/mock/resolve.ts';
import { createRule } from '../core/defaults.ts';
import type { InterceptedRequest } from '../core/types.ts';

function installWorker({ respond = true, enabled = true } = {}) {
  const scope = 'https://studio.example/workbench/';
  const listeners = new Map<string, (event: unknown) => void>();
  const network = vi.fn(async () => new Response('network'));
  const client = {
    id: 'tab',
    type: 'window',
    url: scope,
    postMessage(message: { type: string; request: InterceptedRequest }, ports: MessagePort[]) {
      if (!respond || message.type !== 'REQUEST') return;
      ports[0]?.postMessage(resolveRequest(message.request, {
        rules: [createRule({ method: 'POST', pattern: '/items' })],
        templates: [],
        settings: { interceptionEnabled: enabled, passthroughUnmatched: false },
      }));
      ports[0]?.close();
    },
  };
  const self = {
    location: new URL('mock-sw.js', scope),
    registration: { scope },
    clients: { get: async () => client },
    addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
  };
  new Function('self', 'fetch', 'Date', 'setTimeout', workerScript)(
    self, network, { now: vi.fn().mockReturnValueOnce(1).mockReturnValue(21_001) },
    respond ? setTimeout : (callback: () => void) => setTimeout(callback, 0),
  );
  return {
    network,
    heartbeat: () => listeners.get('message')?.({
      data: { protocol: 'wms/1', type: 'HEARTBEAT', enabled: true },
      source: client,
      ports: [],
    }),
    fetch: (path: string) => {
      let response: Promise<Response> | undefined;
      listeners.get('fetch')?.({
        request: new Request(new URL(path, scope), { method: 'POST', body: 'test' }),
        clientId: client.id,
        respondWith: (value: Promise<Response>) => { response = value; },
      });
      return response ?? network();
    },
  };
}

describe('Service Worker interception', () => {
  it('consults a suspended tab with a stale heartbeat before sending a POST', async () => {
    const worker = installWorker();
    worker.heartbeat();
    const response = await worker.fetch('/items');
    expect(await response.json()).toEqual({ ok: true });
    expect(worker.network).not.toHaveBeenCalled();
  });

  it('honors strict mode before a restarted worker receives a heartbeat', async () => {
    const worker = installWorker();
    const response = await worker.fetch('/unmatched');
    expect(response.status).toBe(404);
    expect(worker.network).not.toHaveBeenCalled();
  });

  it('blocks a request when the app cannot confirm passthrough', async () => {
    const worker = installWorker({ respond: false });
    expect((await worker.fetch('/items')).type).toBe('error');
    expect(worker.network).not.toHaveBeenCalled();
  });

  it('allows passthrough when the page confirms interception is paused', async () => {
    const worker = installWorker({ enabled: false });
    expect(await (await worker.fetch('/items')).text()).toBe('network');
    expect(worker.network).toHaveBeenCalledTimes(1);
  });
});
