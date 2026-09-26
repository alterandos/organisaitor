// `fake-indexeddb/auto` polyfills the global indexedDB this module needs (same pattern already
// used by vault.test.ts). One shared database connection for the whole file (the module caches
// its IDBDatabase at module scope, and fake-indexeddb's deleteDatabase blocks until every open
// connection closes — simpler to just not fight that and instead write assertions that don't
// assume a clean slate, checking "the entry I just made has the right shape" rather than "the
// list has exactly N entries").
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { saveBackupSnapshot, listBackupSnapshots, getBackupSnapshot, deleteBackupSnapshot } from '@/services/autoBackupStorage';

describe('autoBackupStorage', () => {
  it('saves a snapshot and lists it back, newest first among whatever else exists', async () => {
    const idA = await saveBackupSnapshot(JSON.stringify({ a: 1 }));
    await new Promise((r) => setTimeout(r, 5)); // distinguishable createdAt ordering
    const idB = await saveBackupSnapshot(JSON.stringify({ b: 2 }));
    expect(idA).not.toBeNull();
    expect(idB).not.toBeNull();

    const list = await listBackupSnapshots();
    const idxA = list.findIndex((s) => s.id === idA);
    const idxB = list.findIndex((s) => s.id === idB);
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeLessThan(idxA); // B is newer, so it sorts before A
  });

  it('round-trips the exact stored JSON through getBackupSnapshot', async () => {
    const payload = JSON.stringify({ 'todo-app-storage': { state: { tasks: {} }, version: 11 } });
    const id = await saveBackupSnapshot(payload);
    const back = await getBackupSnapshot(id!);
    expect(back).toBe(payload);
  });

  it('getBackupSnapshot returns null for an id that was never saved', async () => {
    expect(await getBackupSnapshot(999_999_999)).toBeNull();
  });

  it('deleteBackupSnapshot removes it from the list without touching other entries', async () => {
    const keep   = await saveBackupSnapshot(JSON.stringify({ keep: true }));
    const remove = await saveBackupSnapshot(JSON.stringify({ remove: true }));

    await deleteBackupSnapshot(remove!);

    const list = await listBackupSnapshots();
    expect(list.some((s) => s.id === remove)).toBe(false);
    expect(list.some((s) => s.id === keep)).toBe(true);
  });
});
