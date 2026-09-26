// fake-indexeddb polyfills the global indexedDB that autoBackupStorage.ts needs. `vi.resetModules()`
// between tests means EVERY module touched — autoBackup.ts, autoBackupStorage.ts, AND the domain
// stores it subscribes to (taskStore, settingsStore) — must be dynamically re-imported fresh
// inside each test, not statically at the top of the file. A statically-imported store is the
// ORIGINAL instance from before resetModules ever ran; autoBackup.ts's own internal import of
// that same store path gets a completely different (freshly re-executed) Zustand store object
// after resetModules, so mutating the stale statically-imported one never reaches the
// subscription autoBackup.ts set up on the fresh one.
//
// Note: setAutoBackupChangeThreshold clamps to a minimum of 5 (settingsStore.ts) — tests below
// use 5, not an arbitrarily low number, and were initially failing for that reason alone (a
// requested threshold of 1 or 3 was silently clamped to 5, so too few changes were made to
// cross it — not a test-isolation bug, caught by adding temporary logging to addScore/watch).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A few microtask ticks isn't enough here: takeSnapshotAndRotate() awaits buildBackupSnapshot()
// (one `readPersistedValue` per PERSISTED_STORAGE_KEYS entry, sequential) then
// saveBackupSnapshot() (a real IndexedDB transaction — fake-indexeddb resolves IDBRequest
// success via its own internal task queue, not a plain microtask). Poll instead of guessing a
// tick count.
async function waitUntil(check: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: condition never became true');
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  vi.resetModules();
  // 'todo-autobackup-score' is plain localStorage (the fake Map-backed one from test/setup.ts),
  // which vi.resetModules() does NOT clear — it only resets the JS module graph. Left alone, a
  // score saved by one test leaks into the next test's initAutoBackup()'s loadScore() call.
  localStorage.removeItem('todo-autobackup-score');
});

async function freshModules() {
  const { useSettingsStore } = await import('@/store/settingsStore');
  const { useTaskStore } = await import('@/store/taskStore');
  const { initAutoBackup } = await import('@/services/autoBackup');
  const { listBackupSnapshots } = await import('@/services/autoBackupStorage');
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  return { useSettingsStore, useTaskStore, initAutoBackup, listBackupSnapshots };
}

describe('autoBackup — change-volume trigger (no time-based trigger, per the 2026-09-25 request)', () => {
  it('takes a snapshot once enough weighted changes accumulate, and resets the running score afterward', async () => {
    const { useSettingsStore, useTaskStore, initAutoBackup, listBackupSnapshots } = await freshModules();
    useSettingsStore.getState().setAutoBackupChangeThreshold(5); // the minimum the setter allows
    initAutoBackup();

    const before = await listBackupSnapshots();

    useTaskStore.getState().addTask({ title: 'One' });
    useTaskStore.getState().addTask({ title: 'Two' });
    useTaskStore.getState().addTask({ title: 'Three' });
    useTaskStore.getState().addTask({ title: 'Four' });
    await new Promise((r) => setTimeout(r, 100));
    // Below threshold (4 of 5) — no snapshot yet.
    expect((await listBackupSnapshots()).length).toBe(before.length);

    useTaskStore.getState().addTask({ title: 'Five' });
    await waitUntil(async () => (await listBackupSnapshots()).length > before.length);

    const after = await listBackupSnapshots();
    expect(after.length).toBe(before.length + 1);

    // A single further change shouldn't immediately trigger a second snapshot — the score was
    // reset to 0 after the first one fired.
    useTaskStore.getState().addTask({ title: 'Six' });
    await new Promise((r) => setTimeout(r, 100));
    expect((await listBackupSnapshots()).length).toBe(after.length);
  });

  it('does nothing at all when autoBackupEnabled is off', async () => {
    const { useSettingsStore, useTaskStore, initAutoBackup, listBackupSnapshots } = await freshModules();
    useSettingsStore.getState().setAutoBackupEnabled(false);
    useSettingsStore.getState().setAutoBackupChangeThreshold(5);
    initAutoBackup();

    const before = await listBackupSnapshots();
    for (let i = 0; i < 8; i++) useTaskStore.getState().addTask({ title: `T${i}` });
    await new Promise((r) => setTimeout(r, 100));

    expect((await listBackupSnapshots()).length).toBe(before.length);
  });

  it('turning the setting on after startup begins tracking from that point (reactive, no reload needed)', async () => {
    const { useSettingsStore, useTaskStore, initAutoBackup, listBackupSnapshots } = await freshModules();
    useSettingsStore.getState().setAutoBackupEnabled(false);
    useSettingsStore.getState().setAutoBackupChangeThreshold(5);
    initAutoBackup();

    useTaskStore.getState().addTask({ title: 'Ignored while disabled' });
    await new Promise((r) => setTimeout(r, 100));
    const before = await listBackupSnapshots();

    useSettingsStore.getState().setAutoBackupEnabled(true);
    for (let i = 0; i < 5; i++) useTaskStore.getState().addTask({ title: `Counted ${i}` });
    await waitUntil(async () => (await listBackupSnapshots()).length > before.length);

    expect((await listBackupSnapshots()).length).toBe(before.length + 1);
  });
});
