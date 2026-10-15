import { statusText } from '../core/mock/network.ts';
import { resolveRequest } from '../core/mock/resolve.ts';
import type { InterceptedRequest, MockDecision } from '../core/types.ts';
import { useTraffic, type TrafficEntry } from '../store/traffic.ts';
import { useWorkspace } from '../store/workspace.ts';

const PROTOCOL = 'wms/1';
const HEARTBEAT_MS = 5000;
const READY_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

interface SwRequestMessage {
  protocol: typeof PROTOCOL;
  type: 'REQUEST';
  id: string;
  request: InterceptedRequest;
}

interface SwPassthroughMessage {
  protocol: typeof PROTOCOL;
  type: 'PASSTHROUGH_RESULT';
  id: string;
  status: number;
  durationMs: number;
}

type SwMessage = SwRequestMessage | SwPassthroughMessage;

function decide(request: InterceptedRequest): MockDecision {
  const s = useWorkspace.getState();
  return resolveRequest(request, { rules: s.rules, templates: s.templates, settings: s.settings });
}

function log(id: string, request: InterceptedRequest, decision: MockDecision): void {
  const entry: TrafficEntry = {
    id,
    time: Date.now(),
    method: request.method.toUpperCase(),
    url: request.url,
    outcome:
      decision.kind === 'passthrough' ? 'pending' : decision.kind === 'network-error' ? 'network-error' : decision.injected ? 'injected' : 'mocked',
    status: decision.kind === 'respond' ? decision.status : decision.kind === 'network-error' ? 0 : null,
    ruleId: decision.kind === 'passthrough' ? null : decision.ruleId || null,
    delayMs: decision.kind === 'passthrough' ? 0 : decision.delayMs,
    durationMs: decision.kind === 'passthrough' ? null : decision.delayMs,
  };
  if (decision.kind === 'passthrough' && decision.reason === 'disabled') return;
  useTraffic.getState().add(entry, useWorkspace.getState().settings.logLimit);
}

/** Resolves once the worker has recorded this client, so requests issued afterwards are intercepted. */
function heartbeat(): Promise<boolean> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) return Promise.resolve(false);
  const enabled = useWorkspace.getState().settings.interceptionEnabled;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(false), 1000);
    channel.port1.onmessage = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    controller.postMessage({ protocol: PROTOCOL, type: 'HEARTBEAT', enabled }, [channel.port2]);
  });
}

const beat = () => void heartbeat();

function onWorkerMessage(event: MessageEvent<SwMessage>): void {
  const data = event.data;
  if (!data || data.protocol !== PROTOCOL) return;
  if (data.type === 'REQUEST') {
    const port = event.ports[0];
    let decision: MockDecision;
    try {
      decision = decide(data.request);
    } catch (error) {
      console.error('[web-mock-studio] resolver failed', error);
      decision = { kind: 'passthrough', reason: 'no-match' };
    }
    log(data.id, data.request, decision);
    port?.postMessage(decision.kind === 'respond' ? { ...decision, statusText: statusText(decision.status) } : decision);
  } else if (data.type === 'PASSTHROUGH_RESULT') {
    useTraffic.getState().update(data.id, { outcome: 'passthrough', status: data.status, durationMs: data.durationMs });
  }
}

let pagePatched = false;

/**
 * Fallback for contexts without Service Worker support (insecure origins, some private
 * modes, sandboxed iframes). Only window.fetch is patched, which covers the Request Runner
 * and fetch-based clients; the Service Worker path additionally covers XMLHttpRequest.
 */
function installPagePatch(): void {
  if (pagePatched) return;
  pagePatched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(new URL(String(input), location.href), init);
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headers[k] = v;
    });
    const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.clone().text();
    const intercepted: InterceptedRequest = { method: request.method, url: request.url, headers, body };
    const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const decision = decide(intercepted);
    log(id, intercepted, decision);
    if (decision.kind === 'passthrough') {
      const started = performance.now();
      try {
        const response = await original(request);
        useTraffic.getState().update(id, { outcome: 'passthrough', status: response.status, durationMs: Math.round(performance.now() - started) });
        return response;
      } catch (error) {
        useTraffic.getState().update(id, { outcome: 'passthrough', status: 0, durationMs: Math.round(performance.now() - started) });
        throw error;
      }
    }
    if (decision.delayMs > 0) await new Promise((r) => setTimeout(r, decision.delayMs));
    if (decision.kind === 'network-error') throw new TypeError('Failed to fetch (simulated network failure)');
    return new Response(decision.body, { status: decision.status, statusText: statusText(decision.status), headers: decision.headers });
  };
}

function precacheShell(worker: ServiceWorker): void {
  const urls = new Set<string>([new URL(import.meta.env.BASE_URL, location.href).href]);
  for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    const isAsset = entry.initiatorType !== 'fetch' && entry.initiatorType !== 'xmlhttprequest' && entry.initiatorType !== 'beacon';
    if (isAsset && entry.name.startsWith(location.origin) && !entry.name.includes('mock-sw.js')) urls.add(entry.name);
  }
  worker.postMessage({ protocol: PROTOCOL, type: 'PRECACHE', urls: [...urls] });
}

let engine: Promise<void> | null = null;

/**
 * Idempotent and page-scoped: listeners are installed once and never torn down, so React
 * StrictMode's double-invoked effects cannot detach the bridge the worker depends on.
 */
export function startEngine(): Promise<void> {
  engine ??= boot();
  return engine;
}

async function boot(): Promise<void> {
  const traffic = useTraffic.getState();
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    installPagePatch();
    traffic.setMode('page-patch', window.isSecureContext ? 'Service Workers are not supported in this browser.' : 'Service Workers require HTTPS or localhost.');
    return;
  }

  navigator.serviceWorker.addEventListener('message', onWorkerMessage);
  navigator.serviceWorker.addEventListener('controllerchange', beat);
  window.setInterval(beat, HEARTBEAT_MS);
  useWorkspace.subscribe((s, prev) => {
    if (s.settings.interceptionEnabled !== prev.settings.interceptionEnabled) beat();
  });

  try {
    const script = `${import.meta.env.BASE_URL}mock-sw.js${import.meta.env.PROD ? '?cache=1' : ''}`;
    const registration = await withTimeout(
      navigator.serviceWorker.register(script, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' }).then(async (r) => {
        await navigator.serviceWorker.ready;
        return r;
      }),
      READY_TIMEOUT_MS,
      'Service Worker did not activate in time',
    );
    if (!navigator.serviceWorker.controller) {
      // A hard reload bypasses the worker for this page load; ask it to claim us.
      registration.active?.postMessage({ protocol: PROTOCOL, type: 'CLAIM' });
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 1500);
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            window.clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      });
    }
    if (navigator.serviceWorker.controller) {
      await heartbeat();
      if (import.meta.env.PROD) precacheShell(navigator.serviceWorker.controller);
      traffic.setMode('service-worker', 'fetch and XMLHttpRequest are intercepted by the Service Worker.');
    } else {
      installPagePatch();
      traffic.setMode('page-patch', 'The Service Worker is not controlling this page; using in-page fetch interception.');
    }
  } catch (error) {
    installPagePatch();
    traffic.setMode('page-patch', `Service Worker registration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
