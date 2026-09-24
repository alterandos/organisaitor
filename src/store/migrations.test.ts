// Store migration regression tests (CLAUDE.md "Zustand migration rule"): seed localStorage
// with a fixture of an OLDER persisted version, freshly import the store module (so zustand's
// persist middleware rehydrates from that fixture through `migrate`), and assert the resulting
// in-memory state has the current shape. Each store module must be re-imported via
// `vi.resetModules()` between scenarios — ES module caching would otherwise reuse the first
// hydration for every subsequent `import()` in the same file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function seed(key: string, state: unknown, version: number) {
  localStorage.setItem(key, JSON.stringify({ state, version }));
}

// zustand's persist rehydration runs a microtask chain even against a synchronous storage
// (createJSONStorage always treats storage as potentially async) — flushing a couple of
// microtask ticks after import is enough for it to settle.
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('settingsStore migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('v1 -> v2 backfills calendarLayerVisibility.tentative to true (missing key must not read as hidden)', async () => {
    seed(
      'todo-settings',
      { theme: 'dark', calendarLayerVisibility: { events: true, reminders: false, taskScheduled: true, taskDeadlines: true } },
      1
    );
    const { useSettingsStore } = await import('@/store/settingsStore');
    await flush();
    const state = useSettingsStore.getState();
    expect(state.calendarLayerVisibility.tentative).toBe(true);
    // Untouched fields survive the migration.
    expect(state.theme).toBe('dark');
    expect(state.calendarLayerVisibility.reminders).toBe(false);
  });

  it('v0 -> v2 (unversioned legacy store) ends up with every current field', async () => {
    seed('todo-settings', { clockFormat: '12h' }, 0);
    const { useSettingsStore } = await import('@/store/settingsStore');
    await flush();
    const state = useSettingsStore.getState();
    expect(state.clockFormat).toBe('12h');
    expect(state.calendarLayerVisibility).toMatchObject({ events: true, tentative: true });
  });

  it('a fresh install with no persisted state at all gets the full default shape', async () => {
    const { useSettingsStore } = await import('@/store/settingsStore');
    await flush();
    expect(useSettingsStore.getState().calendarLayerVisibility.tentative).toBe(true);
  });
});

describe('scheduleStore migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('v0 -> v1 backfills requiresCommitment: false and committedDates: [] on every block', async () => {
    seed(
      'todo-schedules',
      {
        schedules: {
          s1: {
            id: 's1', name: 'Uni', color: '#000', startDate: null, endDate: null, active: true,
            collectionId: null, createdAt: 'x', updatedAt: 'x',
            blocks: [
              {
                id: 'b1', title: 'Lecture', daysOfWeek: [1], startTime: '09:00', endTime: '10:00',
                location: null, interval: 1, intervalAnchor: '2026-01-05', exceptions: [], notes: null,
                // requiresCommitment / committedDates deliberately absent — pre-migration shape
              },
            ],
          },
        },
      },
      0
    );
    const { useScheduleStore } = await import('@/store/scheduleStore');
    await flush();
    const block = useScheduleStore.getState().schedules['s1' as never].blocks[0];
    expect(block.requiresCommitment).toBe(false);
    expect(block.committedDates).toEqual([]);
    // Untouched fields survive.
    expect(block.title).toBe('Lecture');
  });

  it('leaves an already-migrated block\'s values alone rather than resetting them', async () => {
    seed(
      'todo-schedules',
      {
        schedules: {
          s1: {
            id: 's1', name: 'Gym', color: '#000', startDate: null, endDate: null, active: true,
            collectionId: null, createdAt: 'x', updatedAt: 'x',
            blocks: [
              {
                id: 'b1', title: 'Class', daysOfWeek: [1], startTime: '09:00', endTime: '10:00',
                location: null, interval: 1, intervalAnchor: '2026-01-05', exceptions: [], notes: null,
                requiresCommitment: true, committedDates: ['2026-01-05'],
              },
            ],
          },
        },
      },
      0
    );
    const { useScheduleStore } = await import('@/store/scheduleStore');
    await flush();
    const block = useScheduleStore.getState().schedules['s1' as never].blocks[0];
    expect(block.requiresCommitment).toBe(true);
    expect(block.committedDates).toEqual(['2026-01-05']);
  });

  it('a store with no schedules at all migrates without error', async () => {
    seed('todo-schedules', { schedules: {} }, 0);
    const { useScheduleStore } = await import('@/store/scheduleStore');
    await flush();
    expect(useScheduleStore.getState().schedules).toEqual({});
  });
});

describe('taskStore migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('v9 -> v11 (single-step gap, as CLAUDE.md documents) backfills crossAppRefs and archivedAt/archiveReason', async () => {
    seed(
      'todo-app-storage',
      {
        tasks: { t1: { id: 't1', title: 'X', archived: false, updatedAt: '2026-01-01T00:00:00.000Z' } },
        tags: {}, collections: {}, purposes: {},
      },
      9
    );
    const { useTaskStore } = await import('@/store/taskStore');
    await flush();
    const t = useTaskStore.getState().tasks['t1' as never];
    expect(t.crossAppRefs).toEqual([]);
    expect(t.archivedAt).toBeNull();
    expect(t.archiveReason).toBeNull();
  });

  it(
    'a store several versions behind (v2) receives EVERY applicable patch on the way to v11, ' +
      'not just the first one — regression test for a real bug found 2026-09-24: each ' +
      '`if (fromVersion < N)` branch used to `return` immediately, so a store that skipped ' +
      'several app versions in one load (e.g. was not opened for months) silently ended up ' +
      'missing every later step\'s fields. Fixed by making the branches fall through (reassigning ' +
      '`state` instead of returning) so they genuinely cumulate. See BACKLOG.md.',
    async () => {
      seed(
        'todo-app-storage',
        {
          tasks: { t1: { id: 't1', title: 'X', archived: false, updatedAt: '2026-01-01T00:00:00.000Z' } },
          tags: {},
          collections: { c1: { id: 'c1', name: 'Proj', kind: 'project' } },
          purposes: {},
        },
        2
      );
      const { useTaskStore } = await import('@/store/taskStore');
      await flush();
      const state = useTaskStore.getState();
      const t = state.tasks['t1' as never] as unknown as Record<string, unknown>;
      const c = state.collections['c1' as never] as unknown as Record<string, unknown>;

      // The <5 step's own collection fields.
      expect(c.fieldSchema).toEqual([]);
      // Every later step's fields must ALSO have been backfilled, not just the first applicable one.
      expect(t.scheduledAt).toBeNull();
      expect(t.scheduledTime).toBeNull();
      expect(t.calendarEventId).toBeNull();
      expect(c.collectionId).toBeNull();
      expect(c.archivedAt).toBeNull();
      expect(t.calendarReminderId).toBeNull();
      expect(t.crossAppRefs).toEqual([]);
      expect(t.archivedAt).toBeNull();
      expect(t.archiveReason).toBeNull();
    }
  );
});

afterEach(() => {
  localStorage.clear();
});
