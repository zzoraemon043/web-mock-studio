import type { StateStorage } from 'zustand/middleware';

const DB_NAME = 'web-mock-studio';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
let pending = Promise.resolve();
let lastRevision = 0;

interface Snapshot {
  revision: number;
  value: string;
}

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => {
      request.onsuccess = () => request.result.close();
      reject(new Error('IndexedDB open blocked'));
    };
  }).catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function run<T>(op: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        let value: T;
        op(tx.objectStore(STORE), (result) => { value = result; });
        tx.oncomplete = () => resolve(value);
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

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.then(() => undefined, () => undefined);
  return result;
}

function decode(raw: string | null | undefined): Snapshot | null {
  if (typeof raw !== 'string') return null;
  try {
    const snapshot = JSON.parse(raw) as Partial<Snapshot> | null;
    if (typeof snapshot?.value === 'string' && typeof snapshot.revision === 'number' && Number.isSafeInteger(snapshot.revision)) {
      return { revision: snapshot.revision, value: snapshot.value };
    }
  } catch {
    // Older snapshots were stored without a revision.
  }
  return { revision: 0, value: raw };
}

function localRevision(key: string): number {
  const revision = Number(localStorage.getItem(key));
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
}

async function syncSnapshot(name: string, value?: string): Promise<Snapshot | null> {
  const revisionKey = `${name}:idb-revision`;
  const local = await attempt(() => ({ raw: localStorage.getItem(name), revision: localRevision(revisionKey) }));
  const fallback = decode(local.ok ? local.value.raw : null);
  let observed = Math.max(fallback?.revision ?? 0, local.ok ? local.value.revision : 0);
  const next = (text: string): Snapshot => {
    lastRevision = Math.max(Date.now(), lastRevision + 1, observed + 1);
    return { revision: lastRevision, value: text };
  };
  const idb = await attempt(() => run<Snapshot | null>((store, result) => {
    const request = store.get(name);
    request.onsuccess = () => {
      const indexed = decode(request.result);
      const latest = indexed && indexed.revision >= (fallback?.revision ?? 0) ? indexed : fallback;
      observed = Math.max(observed, latest?.revision ?? 0);
      const snapshot = value === undefined ? latest : next(value);
      if (snapshot && snapshot !== indexed) store.put(JSON.stringify(snapshot), name);
      result(snapshot);
    };
  }));

  lastRevision = Math.max(lastRevision, observed);
  if (idb.ok) {
    await attempt(() => {
      if (fallback && local.ok && localStorage.getItem(name) === local.value.raw) localStorage.removeItem(name);
      const revision = idb.value?.revision ?? 0;
      if (revision > localRevision(revisionKey)) localStorage.setItem(revisionKey, String(revision));
    });
    return idb.value;
  }
  if (value === undefined) return fallback;
  const snapshot = next(value);
  await attempt(() => localStorage.setItem(name, JSON.stringify(snapshot)));
  return snapshot;
}

/**
 * IndexedDB-backed storage with a localStorage fallback. IndexedDB avoids the ~5 MB
 * localStorage quota, which large dataset templates can exceed; the fallback covers
 * private modes and embedded contexts where IndexedDB is unavailable. If both fail,
 * state stays in memory for the session.
 */
export const workspaceStorage: StateStorage = {
  getItem(name) {
    return enqueue(async () => (await syncSnapshot(name))?.value ?? null);
  },
  setItem(name, value) {
    return enqueue(async () => { await syncSnapshot(name, value); });
  },
  removeItem(name) {
    return enqueue(async () => {
      const idb = await attempt(() => run<void>((store) => { store.delete(name); }));
      await attempt(() => {
        localStorage.removeItem(name);
        if (idb.ok) localStorage.removeItem(`${name}:idb-revision`);
      });
    });
  },
};
