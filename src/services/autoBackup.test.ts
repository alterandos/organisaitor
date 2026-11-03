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

// Each test waits on the work itself (autoBackupSettled: the snapshot being written, and the
// upgrade snapshot initAutoBackup starts), never on the clock. Fixed waits and a 2-second poll made
// the first test fail now and then under full-suite load (fixed 2026-11-03). Only automatic
// snapshots are counted, so an upgrade snapshot can't change the count.

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
  const { autoBackupSettled } = await import('@/services/autoBackup');
  const storage = await import('@/services/autoBackupStorage');
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  // The automatic snapshots once everything started has been written.
  const listBackupSnapshots = async () => {
    await autoBackupSettled();
    return (await storage.listBackupSnapshots()).filter((snap) => snap.kind === 'auto');
  };
  return { useSettingsStore, useTaskStore, initAutoBackup, listBackupSnapshots };
}

// Each test builds and writes whole backups: on a loaded machine (the full suite) that can pass the
// default 5 s, with nothing wrong (2026-11-03), so these get longer.
describe('autoBackup — change-volume trigger (no time-based trigger, per the 2026-09-25 request)', { timeout: 20_000 }, () => {
  it('takes a snapshot once enough weighted changes accumulate, and resets the running score afterward', async () => {
    const { useSettingsStore, useTaskStore, initAutoBackup, listBackupSnapshots } = await freshModules();
    useSettingsStore.getState().setAutoBackupChangeThreshold(5); // the minimum the setter allows
    initAutoBackup();

    const before = await listBackupSnapshots();

    useTaskStore.getState().addTask({ title: 'One' });
    useTaskStore.getState().addTask({ title: 'Two' });
    useTaskStore.getState().addTask({ title: 'Three' });
    useTaskStore.getState().addTask({ title: 'Four' });
    // Below threshold (4 of 5) — no snapshot yet.
    expect((await listBackupSnapshots()).length).toBe(before.length);

    useTaskStore.getState().addTask({ title: 'Five' });

    const after = await listBackupSnapshots();
    expect(after.length).toBe(before.length + 1);

    // A single further change shouldn't immediately trigger a second snapshot — the score was
    // reset to 0 after the first one fired.
    useTaskStore.getState().addTask({ title: 'Six' });
    expect((await listBackupSnapshots()).length).toBe(after.length);
  });

  it('does nothing at all when autoBackupEnabled is off', async () => {
    const { useSettingsStore, useTaskStore, initAutoBackup, listBackupSnapshots } = await freshModules();
    useSettingsStore.getState().setAutoBackupEnabled(false);
    useSettingsStore.getState().setAutoBackupChangeThreshold(5);
    initAutoBackup();

    const before = await listBackupSnapshots();
    for (let i = 0; i < 8; i++) useTaskStore.getState().addTask({ title: `T${i}` });

    expect((await listBackupSnapshots()).length).toBe(before.length);
  });

  it('turning the setting on after startup begins tracking from that point (reactive, no reload needed)', async () => {
    const { useSettingsStore, useTaskStore, initAutoBackup, listBackupSnapshots } = await freshModules();
    useSettingsStore.getState().setAutoBackupEnabled(false);
    useSettingsStore.getState().setAutoBackupChangeThreshold(5);
    initAutoBackup();

    useTaskStore.getState().addTask({ title: 'Ignored while disabled' });
    const before = await listBackupSnapshots();

    useSettingsStore.getState().setAutoBackupEnabled(true);
    for (let i = 0; i < 5; i++) useTaskStore.getState().addTask({ title: `Counted ${i}` });

    expect((await listBackupSnapshots()).length).toBe(before.length + 1);
  });
});
