/*
 * Web Mock Studio Service Worker.
 *
 * The worker holds no mock rules. For each fetch/XHR issued by an activated page it
 * forwards a serialized request over a MessageChannel, the page resolves it against
 * the live workspace, and the worker materializes the decision (delay, status, body,
 * or a simulated network failure). Keeping resolution in the page means rule edits
 * apply instantly with no worker restart and no duplicated matching logic.
 */

const PROTOCOL = 'wms/1';
const RESOLVE_TIMEOUT_MS = 5000;
const CLIENT_TTL_MS = 20000;
const SHELL_CACHE = 'wms-shell-v1';
const CACHE_SHELL = new URL(self.location.href).searchParams.get('cache') === '1';

/** clientId -> last heartbeat timestamp. Rebuilt from heartbeats if the worker restarts. */
const activeClients = new Map();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('wms-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.protocol !== PROTOCOL) return;
  const clientId = event.source && event.source.id;

  switch (data.type) {
    case 'HEARTBEAT':
      if (!clientId) return;
      if (data.enabled) activeClients.set(clientId, Date.now());
      else activeClients.delete(clientId);
      break;
    case 'DEACTIVATE':
      if (clientId) activeClients.delete(clientId);
      break;
    case 'CLAIM':
      event.waitUntil(self.clients.claim());
      break;
    case 'PRECACHE':
      // The first page load happens before this worker controls the page, so its assets
      // never pass through the fetch handler. The page reports them once it is controlled.
      if (CACHE_SHELL && Array.isArray(data.urls)) {
        const urls = data.urls.filter((u) => typeof u === 'string' && new URL(u).origin === self.location.origin);
        event.waitUntil(caches.open(SHELL_CACHE).then((cache) => Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)))));
      }
      break;
  }
  if (event.ports[0]) event.ports[0].postMessage({ protocol: PROTOCOL, type: 'ACK', active: activeClients.has(clientId) });
});

function isActive(clientId) {
  const seen = activeClients.get(clientId);
  if (!seen) return false;
  if (Date.now() - seen > CLIENT_TTL_MS) {
    activeClients.delete(clientId);
    return false;
  }
  return true;
}

function ask(client, message) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), RESOLVE_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    client.postMessage(message, [channel.port2]);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function serialize(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.clone().text();
    } catch {
      body = null;
    }
  }
  return { method: request.method, url: request.url, headers, body };
}

async function handleIntercept(event, client) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const started = Date.now();
  const request = await serialize(event.request);
  const decision = await ask(client, { protocol: PROTOCOL, type: 'REQUEST', id, request });

  if (!decision || decision.kind === 'passthrough') {
    try {
      const response = await fetch(event.request);
      client.postMessage({ protocol: PROTOCOL, type: 'PASSTHROUGH_RESULT', id, status: response.status, durationMs: Date.now() - started });
      return response;
    } catch (error) {
      client.postMessage({ protocol: PROTOCOL, type: 'PASSTHROUGH_RESULT', id, status: 0, durationMs: Date.now() - started, error: String(error) });
      throw error;
    }
  }

  if (decision.delayMs > 0) await sleep(decision.delayMs);

  if (decision.kind === 'network-error') return Response.error();

  return new Response(decision.body, {
    status: decision.status,
    statusText: decision.statusText || '',
    headers: decision.headers,
  });
}

async function shellResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  if (request.mode === 'navigate') {
    try {
      const fresh = await fetch(request);
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(request)) || (await cache.match(new URL('./', self.registration.scope).href)) || Response.error();
    }
  }
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || Response.error());
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const sameOrigin = new URL(request.url).origin === self.location.origin;

  // Only programmatic requests (fetch/XHR have an empty destination) are mockable.
  // Documents, scripts, styles and images load untouched, which also prevents a
  // deadlock where the page would be asked to resolve its own bootstrap modules.
  if (request.mode !== 'navigate' && request.destination === '' && isActive(event.clientId)) {
    event.respondWith(
      self.clients.get(event.clientId).then((client) => (client ? handleIntercept(event, client) : fetch(request))),
    );
    return;
  }

  if (CACHE_SHELL && sameOrigin && request.method === 'GET' && (request.mode === 'navigate' || request.destination !== '')) {
    event.respondWith(shellResponse(request));
  }
});
