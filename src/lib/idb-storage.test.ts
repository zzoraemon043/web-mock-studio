import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function installStorage() {
  const indexed = new Map<string, string>();
  const local = new Map<string, string>();
  const storage = { available: true };
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => local.get(name) ?? null,
    setItem: (name: string, value: string) => local.set(name, value),
    removeItem: (name: string) => local.delete(name),
  });
  vi.stubGlobal('indexedDB', {
    open() {
      if (!storage.available) throw new Error('IndexedDB is unavailable');
      const request: { onsuccess?: () => void; result: unknown } = {
        result: {
          transaction() {
            if (!storage.available) throw new Error('IndexedDB is unavailable');
            const tx = {
              oncomplete: undefined as (() => void) | undefined,
              objectStore: () => ({
                get(name: string) {
                  const read = { result: indexed.get(name), onsuccess: undefined as (() => void) | undefined };
                  queueMicrotask(() => read.onsuccess?.());
                  return read;
                },
                put: (value: string, name: string) => { indexed.set(name, value); return {}; },
                delete: (name: string) => { indexed.delete(name); return {}; },
              }),
            };
            queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
            return tx;
          },
        },
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return { storage, indexed, local };
}

const KEY = 'test:workspace';

describe('workspace storage', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recovers a newer fallback write over a legacy IndexedDB snapshot', async () => {
    const { storage, indexed, local } = installStorage();
    const { workspaceStorage } = await import('./idb-storage.ts');
    indexed.set(KEY, '{"state":{"rules":[]}}');
    storage.available = false;
    const latest = '{"state":{"rules":["new"]}}';
    await workspaceStorage.setItem(KEY, latest);
    expect(await workspaceStorage.getItem(KEY)).toBe(latest);

    storage.available = true;
    vi.resetModules();
    const { workspaceStorage: recovered } = await import('./idb-storage.ts');
    expect(await recovered.getItem(KEY)).toBe(latest);
    expect(local.has(KEY)).toBe(false);
    expect(await recovered.getItem(KEY)).toBe(latest);
  });

  it('retries opening IndexedDB and keeps the newest revisions across backends', async () => {
    const { storage, local } = installStorage();
    const { workspaceStorage } = await import('./idb-storage.ts');
    storage.available = false;
    await workspaceStorage.setItem(KEY, 'fallback');
    const previous = local.get(KEY)!;
    storage.available = true;
    await workspaceStorage.setItem(KEY, 'recovered');
    expect(local.has(KEY)).toBe(false);
    local.set(KEY, previous);
    expect(await workspaceStorage.getItem(KEY)).toBe('recovered');
  });

  it('orders writes across sessions when the system clock moves backward', async () => {
    const { storage } = installStorage();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const { workspaceStorage } = await import('./idb-storage.ts');
    await workspaceStorage.setItem(KEY, 'indexed edit');

    storage.available = false;
    clock.mockReturnValue(1_000);
    vi.resetModules();
    const { workspaceStorage: offline } = await import('./idb-storage.ts');
    await offline.setItem(KEY, 'later fallback edit');

    storage.available = true;
    expect(await offline.getItem(KEY)).toBe('later fallback edit');
  });
});
