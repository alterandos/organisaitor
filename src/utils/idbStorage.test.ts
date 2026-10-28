// @vitest-environment jsdom
// The write-behind to IndexedDB, and what happens when the page goes away (2026-10-28: a reload lost
// what had just been typed, because writes waiting behind the one in flight were never started).
// A fresh copy of the module over fake-indexeddb, since the test setup preloads the shared one
// without an IndexedDB.
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

async function freshStorage() {
  vi.resetModules();
  const mod = await import('./idbStorage');
  await mod.preloadIdbStorage();
  return mod;
}

function readRaw(key: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('organisaitor', 1);
    open.onsuccess = () => {
      const req = open.result.transaction('kv', 'readonly').objectStore('kv').get(key);
      req.onsuccess = () => { open.result.close(); resolve(req.result as string | undefined); };
      req.onerror = () => reject(req.error);
    };
    open.onerror = () => reject(open.error);
  });
}

describe('IndexedDB write-behind', () => {
  it('settlePersistWrites waits until every key\'s latest value is stored', async () => {
    const { persistStorageIdb, settlePersistWrites } = await freshStorage();
    const storage = persistStorageIdb<{ n: number }>()!;
    for (let n = 1; n <= 5; n++) {
      storage.setItem('notes-storage', { state: { n }, version: 1 });
      storage.setItem('trash-storage', { state: { n: n * 10 }, version: 1 });
    }
    await settlePersistWrites();
    expect(JSON.parse((await readRaw('notes-storage'))!).state.n).toBe(5);
    expect(JSON.parse((await readRaw('trash-storage'))!).state.n).toBe(50);
  });

  it('once the page is hidden, every waiting write starts at once, and later ones too', async () => {
    const { persistStorageIdb, settlePersistWrites } = await freshStorage();
    const storage = persistStorageIdb<{ v: string }>()!;
    storage.setItem('notes-storage', { state: { v: 'in flight' }, version: 1 });
    storage.setItem('trash-storage', { state: { v: 'waiting' }, version: 1 });
    window.dispatchEvent(new Event('pagehide'));
    // An editor saving on its own way out, after the page was told it's going.
    storage.setItem('notes-storage', { state: { v: 'last words' }, version: 1 });
    await settlePersistWrites();
    expect(JSON.parse((await readRaw('notes-storage'))!).state.v).toBe('last words');
    expect(JSON.parse((await readRaw('trash-storage'))!).state.v).toBe('waiting');
    window.dispatchEvent(new Event('pageshow'));
  });
});
