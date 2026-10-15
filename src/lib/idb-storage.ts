import type { StateStorage } from 'zustand/middleware';

const DB_NAME = 'web-mock-studio';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      }),
  );
}

async function attempt<T>(fn: () => Promise<T> | T): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false };
  }
}

/**
 * IndexedDB-backed storage with a localStorage fallback. IndexedDB avoids the ~5 MB
 * localStorage quota, which large dataset templates can exceed; the fallback covers
 * private modes and embedded contexts where IndexedDB is unavailable. If both fail,
 * state stays in memory for the session.
 */
export const workspaceStorage: StateStorage = {
  async getItem(name) {
    const idb = await attempt(() => run<string | undefined>('readonly', (s) => s.get(name)));
    if (idb.ok && idb.value !== undefined) return idb.value;
    const local = await attempt(() => localStorage.getItem(name));
    return local.ok ? local.value : null;
  },
  async setItem(name, value) {
    const idb = await attempt(() => run('readwrite', (s) => s.put(value, name)));
    if (!idb.ok) await attempt(() => localStorage.setItem(name, value));
  },
  async removeItem(name) {
    await attempt(() => run('readwrite', (s) => s.delete(name)));
    await attempt(() => localStorage.removeItem(name));
  },
};
