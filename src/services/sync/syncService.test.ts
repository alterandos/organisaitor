// @vitest-environment jsdom
//
// Exercises the sync pipeline (mergeRecords, per-table failure isolation, the enqueue()
// mutex, customListTypes) through its public API (initSync/forceUpload), against a fake
// Supabase client, rather than importing the internal functions directly — they aren't
// exported, and going through the real entry points is what actually proves the pipeline
// behaves, not just that a helper function does in isolation. jsdom environment because
// initSync/stopSync register/unregister `window` listeners and a `setInterval` retry timer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useTrackerStore } from '@/store/trackerStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import type { TaskId, TagId } from '@/types';

const fake = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tables: Record<string, { rows: any[]; selectError?: { message: string } }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upserts: Record<string, any[]> = {};
  const updates: Record<string, { ids: string[] }[]> = {};
  const upsertErrors: Record<string, { message: string } | undefined> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deferredUpserts: Record<string, { rows: any[]; resolve: () => void }[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function reset(cfg: Record<string, { rows?: any[]; selectError?: { message: string } }> = {}) {
    tables = {};
    for (const k of Object.keys(cfg)) tables[k] = { rows: cfg[k].rows ?? [], selectError: cfg[k].selectError };
    for (const k of Object.keys(upserts)) delete upserts[k];
    for (const k of Object.keys(updates)) delete updates[k];
    for (const k of Object.keys(upsertErrors)) delete upsertErrors[k];
    for (const k of Object.keys(deferredUpserts)) delete deferredUpserts[k];
  }

  // Makes the NEXT upsert() call to `table` hang until `resolveNext(table)` is called — for
  // testing what happens to a pending edit while its push is still in flight.
  function deferNextUpsert(table: string) {
    deferredUpserts[table] = deferredUpserts[table] ?? [];
  }
  function resolveNext(table: string) {
    const next = deferredUpserts[table]?.shift();
    next?.resolve();
  }

  function from(table: string) {
    return {
      select: () => ({
        eq: () => Promise.resolve({ data: tables[table]?.rows ?? [], error: tables[table]?.selectError ?? null }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upsert: async (rows: any[]) => {
        if (table in deferredUpserts) {
          await new Promise<void>((resolve) => { deferredUpserts[table].push({ rows, resolve }); });
        }
        // A failed call didn't actually persist anything — only log rows that "succeeded", so
        // the log reflects what the server would actually hold, not every attempt made.
        if (upsertErrors[table]) return { data: null, error: upsertErrors[table] };
        (upserts[table] ??= []).push(...rows);
        return { data: rows, error: null };
      },
      update: () => ({
        in: (_col: string, ids: string[]) => {
          (updates[table] ??= []).push({ ids });
          return Promise.resolve({ error: null });
        },
      }),
    };
  }

  return { reset, from, upserts, updates, upsertErrors, deferNextUpsert, resolveNext };
});

vi.mock('@/services/supabase', () => ({ supabase: { from: (t: string) => fake.from(t) } }));

const { initSync, forceUpload, stopSync, clearPendingSync, onSyncStatus } = await import('@/services/sync/syncService');

const USER = 'user-1';

// At least one live row somewhere in the isEmpty-checked tables, so the "remote looks empty
// -> push local up" branch never fires by accident in a test that's really exercising the
// merge branch. Kept out of every assertion below.
const KEEP_ALIVE_COLLECTION = {
  id: 'keep-alive', kind: 'project', name: 'Keep', description: null, color: null,
  purpose_ids: [], tag_ids: [], deadline: null, completed: false, completed_at: null,
  field_schema: [], routine_tasks: [], repeat_config: null, collection_id: null, archived_at: null,
  created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z',
};

function taskRow(overrides: Record<string, unknown>) {
  return {
    id: 't1', title: 'Row', notes: null, links: [], completed: false, completed_at: null,
    collection_id: null, tag_ids: [], purpose_ids: [], priority: 'none',
    deadline: null, deadline_time: null, scheduled_at: null, scheduled_time: null,
    calendar_event_id: null, calendar_reminder_id: null, remind_at: null,
    archived: false, archived_at: null, archive_reason: null, kind: 'action', time_intensity: null,
    parent_id: null, subtask_ids: [], sort_order: 0, cross_app_refs: [],
    created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  stopSync();
  clearPendingSync();
  // Drains any straggling fire-and-forget background sync activity (a `void flushPending(...)`
  // or `void pushIds(...)`) a PRECEDING test kicked off but didn't itself wait for — syncService
  // holds real module-level singleton state (`pending`, `flushing`), so a call still resolving
  // when the next test starts can otherwise interleave with it. stopSync()/clearPendingSync()
  // above stop anything NEW from starting; this lets anything already in flight actually finish.
  await settle(); await settle(); await settle();
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useListStore.setState(useListStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useScheduleStore.setState(useScheduleStore.getInitialState(), true);
  useTrackerStore.setState(useTrackerStore.getInitialState(), true);
  // portfolioStore's initial state always ships pre-seeded investment purposes (a real,
  // deliberate app default — see portfolioStore.ts) — left in place, every test here would
  // have queueLocalOnlyAndNewer mark them dirty and push them in the background on every
  // initSync, racing whatever that specific test is actually checking. Cleared explicitly
  // rather than worked around, since none of these tests are about Portfolio.
  usePortfolioStore.setState({ investmentPurposes: {}, watchlistItems: {}, portfolioTags: {} });
  fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] } });
});

afterEach(() => {
  stopSync();
  vi.useRealTimers(); // belt-and-braces: a failed assertion inside a fake-timers test must never
  // leave the clock faked for the next test (a real setTimeout/tick() in a later test would then
  // hang until vitest's own test timeout, masking the real failure behind a confusing one).
});

describe('mergeRecords, via initSync', () => {
  it('a remote tombstone (deleted_at set) removes the local record', async () => {
    useTaskStore.getState().addTask({ title: 'Local' });
    const localId = Object.keys(useTaskStore.getState().tasks)[0] as TaskId;
    fake.reset({
      collections: { rows: [KEEP_ALIVE_COLLECTION] },
      tasks: { rows: [taskRow({ id: localId, deleted_at: '2030-01-01T00:00:00.000Z' })] },
    });

    await initSync(USER);
    expect(useTaskStore.getState().tasks[localId]).toBeUndefined();
  });

  it('the newer updatedAt wins, whichever side it is on', async () => {
    const id = useTaskStore.getState().addTask({ title: 'Local' }) as TaskId;
    useTaskStore.setState((s) => ({ tasks: { ...s.tasks, [id]: { ...s.tasks[id], title: 'Local newer', updatedAt: '2030-06-01T00:00:00.000Z' } } }));
    fake.reset({
      collections: { rows: [KEEP_ALIVE_COLLECTION] },
      tasks: { rows: [taskRow({ id, title: 'Remote older', updated_at: '2030-01-01T00:00:00.000Z' })] },
    });
    await initSync(USER);
    expect(useTaskStore.getState().tasks[id].title).toBe('Local newer');

    // Reverse: remote now newer than local.
    stopSync();
    useTaskStore.setState((s) => ({ tasks: { ...s.tasks, [id]: { ...s.tasks[id], title: 'Local older', updatedAt: '2030-01-01T00:00:00.000Z' } } }));
    fake.reset({
      collections: { rows: [KEEP_ALIVE_COLLECTION] },
      tasks: { rows: [taskRow({ id, title: 'Remote newer', updated_at: '2030-06-01T00:00:00.000Z' })] },
    });
    await initSync(USER);
    expect(useTaskStore.getState().tasks[id].title).toBe('Remote newer');
  });

  it('a local-only record (never on the server) is left alone', async () => {
    const id = useTaskStore.getState().addTask({ title: 'Only here' }) as TaskId;
    fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] }, tasks: { rows: [] } });
    await initSync(USER);
    expect(useTaskStore.getState().tasks[id]?.title).toBe('Only here');
  });

  it('Tag has no updatedAt — remote wins, but stays tombstone-aware', async () => {
    useTaskStore.setState({ tags: { ['g1' as TagId]: { id: 'g1' as TagId, name: 'Local', color: null, notes: null } } });
    fake.reset({
      collections: { rows: [KEEP_ALIVE_COLLECTION] },
      tags: { rows: [{ id: 'g1', name: 'Remote', color: null, notes: null }] },
    });
    await initSync(USER);
    expect(useTaskStore.getState().tags['g1' as TagId].name).toBe('Remote');

    stopSync();
    fake.reset({
      collections: { rows: [KEEP_ALIVE_COLLECTION] },
      tags: { rows: [{ id: 'g1', name: 'Remote', color: null, notes: null, deleted_at: '2030-01-01T00:00:00.000Z' }] },
    });
    await initSync(USER);
    expect(useTaskStore.getState().tags['g1' as TagId]).toBeUndefined();
  });
});

describe('per-table failure isolation', () => {
  it('one table erroring does not stop the others from hydrating, and is named in the status', async () => {
    // Nothing local at all, and 'collections' genuinely empty too (no keep-alive row) — so
    // WITHOUT isolation this would look like "an empty account" and take the isEmpty branch
    // (push local up, meaning: do nothing, since local is empty — the remote 'tasks' row below
    // would then never get pulled in). With isolation, `failed.length > 0` must force the merge
    // branch regardless, so the live remote task still ends up hydrated locally.
    fake.reset({
      collections: { rows: [] },
      lists: { rows: [], selectError: { message: 'permission denied' } },
      tasks: { rows: [taskRow({ id: 'remote-1', title: 'From server' })] },
    });

    let status = '';
    const unsub = onSyncStatus((s, e) => { status = `${s}:${e ?? ''}`; });
    await initSync(USER);
    unsub();

    expect(useTaskStore.getState().tasks['remote-1' as TaskId]?.title).toBe('From server');
    expect(status).toContain('error');
    expect(status).toContain('lists');
    expect(status).toContain('other data synced normally');
  });
});

describe('enqueue() mutex', () => {
  it('forceUpload queued right after initSync sees the post-hydration state, not the pre-hydration one', async () => {
    fake.reset({
      collections: { rows: [KEEP_ALIVE_COLLECTION] },
      tasks: { rows: [taskRow({ id: 'remote-1', title: 'From server' })] },
    });

    const p1 = initSync(USER);
    const p2 = forceUpload(USER); // fired without awaiting p1 first
    await Promise.all([p1, p2]);

    // If the two had interleaved, forceUpload could have read taskStore before hydration landed
    // the remote row and uploaded nothing for 'tasks'.
    const uploaded = fake.upserts.tasks ?? [];
    expect(uploaded.some((r) => r.id === 'remote-1' && r.title === 'From server')).toBe(true);
  });
});

const tick = () => new Promise((r) => setTimeout(r, 0));
const PENDING_KEY = 'todo-sync-pending';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pendingState = (): any => JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');

describe('offline pending-changes queue (sync survives being offline)', () => {
  it('an edit made after initSync is pushed automatically, without a manual forceUpload', async () => {
    fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] }, tasks: { rows: [] } });
    await initSync(USER);

    useTaskStore.getState().addTask({ title: 'Typed while online' });
    await tick();

    expect((fake.upserts.tasks ?? []).some((r) => r.title === 'Typed while online')).toBe(true);
    expect(pendingState().tables.tasks).toBeUndefined(); // pushed and forgotten
  });

  it('a push that fails leaves the edit recorded as pending (in memory AND in localStorage, so it survives a reload)', async () => {
    fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] }, tasks: { rows: [] } });
    fake.upsertErrors.tasks = { message: 'network down' };
    await initSync(USER);

    const id = useTaskStore.getState().addTask({ title: 'Typed while offline' }) as TaskId;
    await tick();

    const pending = pendingState();
    expect(Object.keys(pending.tables.tasks)).toEqual([id]);
  });

  it('the retry timer resends a still-pending change once it eventually succeeds', async () => {
    vi.useFakeTimers();
    fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] }, tasks: { rows: [] } });
    fake.upsertErrors.tasks = { message: 'network down' };
    await initSync(USER);
    const id = useTaskStore.getState().addTask({ title: 'Retried' }) as TaskId;
    await vi.advanceTimersByTimeAsync(0);
    expect(pendingState().tables.tasks[id]).toBeDefined();

    fake.upsertErrors.tasks = undefined; // "back online"
    await vi.advanceTimersByTimeAsync(60_000); // RETRY_EVERY_MS
    await vi.advanceTimersByTimeAsync(0);
    expect((fake.upserts.tasks ?? []).filter((r) => r.id === id)).toHaveLength(1);
    expect(pendingState().tables.tasks).toBeUndefined();
    vi.useRealTimers();
  });

  it('the browser\'s "online" event triggers an immediate retry, without waiting for the timer', async () => {
    fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] }, tasks: { rows: [] } });
    fake.upsertErrors.tasks = { message: 'network down' };
    await initSync(USER);
    const id = useTaskStore.getState().addTask({ title: 'Reconnected' }) as TaskId;
    await tick();
    expect(pendingState().tables.tasks[id]).toBeDefined();

    fake.upsertErrors.tasks = undefined;
    window.dispatchEvent(new Event('online'));
    await tick();
    expect(pendingState().tables.tasks).toBeUndefined();
  });

  it('a record that changes AGAIN while its push is still in flight keeps the newer pending entry — the in-flight push completing must not erase it', async () => {
    fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] }, tasks: { rows: [] } });
    await initSync(USER);
    fake.deferNextUpsert('tasks');

    const id = useTaskStore.getState().addTask({ title: 'First edit' }) as TaskId;
    await tick(); // the push for "First edit" is now in flight, hanging
    const seqAtSend = pendingState().tables.tasks[id];

    useTaskStore.getState().updateTask(id, { title: 'Second edit, while first push in flight' });
    await tick(); // markDirty bumps the seq; this second edit's OWN push also defers (still 'tasks')
    expect(pendingState().tables.tasks[id]).not.toBe(seqAtSend);

    fake.resolveNext('tasks'); // the first (now-stale) push completes...
    await tick();
    // ...but must not have deleted the newer pending entry the second edit created.
    expect(pendingState().tables.tasks[id]).toBeDefined();

    fake.resolveNext('tasks'); // the second push completes and really does clear it
    await tick();
    // The whole "tasks" key is removed once its last pending id clears, not left as {} — so
    // this reads it optionally rather than asserting a specific (now-absent) shape.
    expect(pendingState().tables.tasks?.[id]).toBeUndefined();
  });

  it('queueLocalOnlyAndNewer: a local-only record survives initSync\'s merge AND gets queued for upload automatically', async () => {
    const id = useTaskStore.getState().addTask({ title: 'Created offline, never synced' }) as TaskId;
    fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] }, tasks: { rows: [] } });
    await initSync(USER);
    await tick();
    expect((fake.upserts.tasks ?? []).some((r) => r.id === id)).toBe(true);
  });

  it('clearPendingSync (sign-out) wipes the queue from both memory and localStorage', async () => {
    fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] }, tasks: { rows: [] } });
    fake.upsertErrors.tasks = { message: 'network down' };
    await initSync(USER);
    useTaskStore.getState().addTask({ title: 'X' });
    await tick();
    expect(pendingState()).not.toBeNull();

    clearPendingSync();
    expect(pendingState()).toBeNull();
  });

  it('a previous account\'s leftover pending state is dropped (and overwritten) rather than carried into a different account\'s session', async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ userId: 'someone-else', tables: { tasks: { 'stale-id': 1 } } }));
    fake.reset({ collections: { rows: [KEEP_ALIVE_COLLECTION] }, tasks: { rows: [] } });
    await initSync(USER);
    const pending = pendingState();
    expect(pending.userId).toBe(USER);
    expect(pending.tables).toEqual({});
  });
});

describe('customListTypes — built-in list types are never uploaded', () => {
  it('forceUpload only sends the custom (non-built-in) list types', async () => {
    useListStore.setState((s) => ({
      listTypes: {
        ...s.listTypes,
        'custom-1': { id: 'custom-1', name: 'Mine', icon: '📋', color: null, kind: 'reference', defaultFields: [], isBuiltIn: false } as never,
      },
    }));
    const builtinIds = Object.values(useListStore.getState().listTypes).filter((t) => t.isBuiltIn).map((t) => t.id);
    expect(builtinIds.length).toBeGreaterThan(0); // sanity: built-ins really are pre-seeded

    const counts = await forceUpload(USER);

    const uploadedIds = (fake.upserts.list_types ?? []).map((r) => r.id);
    expect(uploadedIds).toEqual(['custom-1']);
    expect(builtinIds.some((id) => uploadedIds.includes(id))).toBe(false);
    expect(counts.listTypes).toBe(1);
  });
});
