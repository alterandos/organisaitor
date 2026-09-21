import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { LABELS } from '@/config/labels';
import { guardedLocalStorage, reportPersistFailure } from '@/utils/persistStorage';

// IndexedDB-backed persistence for the stores that can outgrow localStorage's ~5 MB (see
// persistStorage.ts). Today that is `notes-storage` alone — notes carry pasted images inline.
//
// The design keeps zustand's persist SYNCHRONOUS, so nothing else in the app changed: at startup
// `preloadIdbStorage()` (awaited in main.tsx BEFORE the app — and therefore any store — is
// imported) reads the database into an in-memory map; the store's getItem/setItem then work on that
// map, and every setItem is written back to IndexedDB in the background (write-behind, latest value
// wins, one write at a time). No async hydration, so no window in which a store is empty and could
// be overwritten by a sync pull or persisted over the real data.
//
// If IndexedDB can't be opened (some private-browsing modes), the affected keys stay on the guarded
// localStorage, exactly as before.

export const IDB_STORAGE_KEYS: readonly string[] = ['notes-storage'];

const DB_NAME = 'organisaitor';
const KV      = 'kv';

let db: IDBDatabase | null = null;
let ready = false;
// Keys (or, when the database can't be opened, all of them) that live in localStorage instead.
const localKeys = new Set<string>();
const cache = new Map<string, string>();
// Set by writePersistedValue (a backup restore): the page is about to reload, and a store write
// racing in from the old in-memory state must not overwrite what was just restored.
let frozen = false;

const isIdbKey = (key: string) => IDB_STORAGE_KEYS.includes(key);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(KV); };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db!.transaction(KV, mode);
    const req = fn(tx.objectStore(KV));
    // Resolve on the transaction's completion, not the request's: only then is a write durable.
    tx.oncomplete = () => resolve(req.result);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

const idbGet    = (key: string) => run<string | undefined>('readonly',  (s) => s.get(key));
const idbPut    = (key: string, value: string) => run('readwrite', (s) => s.put(value, key));
const idbDelete = (key: string) => run('readwrite', (s) => s.delete(key));

// Loads the database into memory, first moving any pre-existing localStorage copy across (put
// into the database, and only THEN removed from localStorage, so a failure loses nothing).
// Must finish before any store that uses persistStorageIdb() is created.
export async function preloadIdbStorage(): Promise<void> {
  try {
    db = await openDb();
  } catch (e) {
    console.error('[storage] IndexedDB unavailable — keeping localStorage', e);
    IDB_STORAGE_KEYS.forEach((k) => localKeys.add(k));
    ready = true;
    return;
  }
  for (const key of IDB_STORAGE_KEYS) {
    try {
      const stored = await idbGet(key);
      if (stored !== undefined) {
        cache.set(key, stored);
        localStorage.removeItem(key); // a stale pre-migration copy — the database wins
        continue;
      }
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        await idbPut(key, legacy);
        localStorage.removeItem(key);
        cache.set(key, legacy);
      }
    } catch (e) {
      console.error(`[storage] could not load or migrate "${key}" — keeping it in localStorage`, e);
      localKeys.add(key);
    }
  }
  ready = true;
  // Ask the browser not to evict the database under storage pressure (a no-op where unsupported).
  void navigator.storage?.persist?.().catch(() => {});
}

// ── write-behind ─────────────────────────────────────────────────────────────

const dirty = new Set<string>();
let flushing = false;

async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (dirty.size > 0) {
      const [key] = dirty;
      dirty.delete(key);
      const value = cache.get(key);
      try {
        if (value === undefined) await idbDelete(key);
        else await idbPut(key, value);
      } catch (e) {
        reportPersistFailure(key, e);
      }
    }
  } finally {
    flushing = false;
  }
}

function queueWrite(key: string) {
  dirty.add(key);
  void flush();
}

function assertReady(name: string) {
  if (!ready) {
    // Loud on purpose: reading an empty cache here would let the store persist an empty state over
    // the real data. Means a store was imported before main.tsx's preloadIdbStorage() finished.
    throw new Error(`[storage] "${name}" was used before preloadIdbStorage() finished`);
  }
}

const idbBacked: StateStorage = {
  getItem: (name) => {
    assertReady(name);
    if (localKeys.has(name)) return guardedLocalStorage.getItem(name) as string | null;
    return cache.get(name) ?? null;
  },
  setItem: (name, value) => {
    assertReady(name);
    if (localKeys.has(name)) { guardedLocalStorage.setItem(name, value); return; }
    if (frozen) return;
    cache.set(name, value);
    queueWrite(name);
  },
  removeItem: (name) => {
    assertReady(name);
    if (localKeys.has(name)) { guardedLocalStorage.removeItem(name); return; }
    if (frozen) return;
    cache.delete(name);
    queueWrite(name);
  },
};

export const persistStorageIdb = <S,>() => createJSONStorage<S>(() => idbBacked);

// ── whole-app backup / restore ───────────────────────────────────────────────
// Backup and restore address every persisted key by name (config/backup.ts), so they go through
// these two instead of touching localStorage — which no longer holds the IndexedDB-backed keys.

// The current stored JSON for a persisted key, wherever it lives. Works before/without the app
// having loaded (the error-boundary fallback uses it): falls back to reading the database directly.
export async function readPersistedValue(key: string): Promise<string | null> {
  if (!isIdbKey(key)) return localStorage.getItem(key);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  if (localKeys.has(key)) return localStorage.getItem(key);
  try {
    if (!db) db = await openDb();
    const stored = await idbGet(key);
    if (stored !== undefined) return stored;
  } catch {
    // fall through to a leftover localStorage copy
  }
  return localStorage.getItem(key);
}

// Stores a restored value and freezes further store writes to IndexedDB-backed keys until the page
// reloads (which restore always does), so the running app can't overwrite it with old state.
export async function writePersistedValue(key: string, value: string): Promise<void> {
  if (!isIdbKey(key) || localKeys.has(key) || !ready) {
    localStorage.setItem(key, value);
    return;
  }
  frozen = true;
  cache.set(key, value);
  await idbPut(key, value);
  localStorage.removeItem(key);
}

export interface StorageUsageRow { key: string; label: string; chars: number; where: 'localStorage' | 'database' }

// Approximate size of each persisted store, biggest first (characters, which is what the browser's
// quota counts). The database-backed ones are listed separately, since they don't count towards
// the ~5 MB localStorage limit.
export function getIdbUsage(): StorageUsageRow[] {
  return [...cache.entries()].map(([key, value]) => ({
    key, label: LABELS.storage.keyNames[key] ?? key, chars: key.length + value.length, where: 'database' as const,
  }));
}
