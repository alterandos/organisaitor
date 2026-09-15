import { supabase } from '@/services/supabase';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useListStore } from '@/store/listStore';
import type { Task, Collection, Tag, Purpose, CalendarEvent, CalendarReminder, TrackerEntry, ScheduleTemplate } from '@/types';
import type { List, ListItem, ListType } from '@/types/lists';
import {
  taskToRow,       rowToTask,
  collectionToRow, rowToCollection,
  tagToRow,        rowToTag,
  purposeToRow,    rowToPurpose,
  eventToRow,      rowToEvent,
  reminderToRow,   rowToReminder,
  entryToRow,      rowToEntry,
  scheduleToRow,   rowToSchedule,
  listToRow,       rowToList,
  listItemToRow,   rowToListItem,
  listTypeToRow,   rowToListType,
} from './mappers';

// Custom (non-built-in) list types only — built-ins have fixed ids, are re-seeded
// locally on every load, and are never uploaded or merged from remote.
const customListTypes = (types: Record<string, ListType>) =>
  Object.fromEntries(Object.entries(types).filter(([, t]) => !t.isBuiltIn));

// Suppresses outbound sync while stores are being hydrated from Supabase.
let hydrating = false;
let unsubscribers: Array<() => void> = [];

// ── Public API ──────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error';
let syncStatus: SyncStatus = 'idle';
let syncError: string | null = null;
const statusListeners: Array<(s: SyncStatus, e: string | null) => void> = [];

function setStatus(s: SyncStatus, err: string | null = null) {
  syncStatus = s;
  syncError  = err;
  statusListeners.forEach((fn) => fn(s, err));
}

export function onSyncStatus(fn: (s: SyncStatus, e: string | null) => void) {
  statusListeners.push(fn);
  fn(syncStatus, syncError);
  return () => { const i = statusListeners.indexOf(fn); if (i >= 0) statusListeners.splice(i, 1); };
}

// Serializes initSync/forceUpload so they can never interleave — e.g. a page-load-triggered
// initSync still in flight racing a manually-triggered forceUpload, each reading/writing store
// state out of order. Every call queues behind whatever's currently running.
let syncQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = syncQueue.then(fn, fn);
  syncQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function initSync(userId: string): Promise<void> {
  return enqueue(() => runInitSync(userId));
}

async function runInitSync(userId: string): Promise<void> {
  stopSync();
  hydrating = true;
  setStatus('syncing');

  try {
    const results = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId),
      supabase.from('collections').select('*').eq('user_id', userId),
      supabase.from('tags').select('*').eq('user_id', userId),
      supabase.from('purposes').select('*').eq('user_id', userId),
      supabase.from('calendar_events').select('*').eq('user_id', userId),
      supabase.from('calendar_reminders').select('*').eq('user_id', userId),
      supabase.from('tracker_entries').select('*').eq('user_id', userId),
      supabase.from('schedules').select('*').eq('user_id', userId),
      supabase.from('lists').select('*').eq('user_id', userId),
      supabase.from('list_items').select('*').eq('user_id', userId),
      supabase.from('list_types').select('*').eq('user_id', userId),
    ]);

    // Surface any permission/connection errors
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      throw new Error(firstError.message);
    }

    const [
      dbTasks, dbCollections, dbTags, dbPurposes, dbEvents, dbReminders, dbEntries,
      dbSchedules, dbLists, dbListItems, dbListTypes,
    ] = results.map((r) => r.data);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const liveCount = (rows: any[] | null) => (rows ?? []).filter((r) => !r.deleted_at).length;
    const isEmpty =
      liveCount(dbTasks) === 0 &&
      liveCount(dbCollections) === 0 &&
      liveCount(dbEvents) === 0 &&
      liveCount(dbSchedules) === 0 &&
      liveCount(dbLists) === 0;

    if (isEmpty) {
      await upsertAllToSupabase(userId);
    } else {
      hydrateStores(
        dbTasks, dbCollections, dbTags, dbPurposes, dbEvents, dbReminders, dbEntries,
        dbSchedules, dbLists, dbListItems, dbListTypes,
      );
    }

    setStatus('idle');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync] init failed:', msg);
    setStatus('error', msg);
  } finally {
    hydrating = false;
  }

  setupSubscriptions(userId);
}

export function stopSync(): void {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
}

export type UploadCounts = {
  tasks: number; collections: number; tags: number; purposes: number;
  events: number; reminders: number; entries: number;
  schedules: number; lists: number; listItems: number; listTypes: number;
};

// Force-uploads ALL current store data to Supabase (upsert), reading live in-memory
// state directly — no localStorage/rehydrate round-trip, no reload required. Queued
// behind any in-flight initSync (see enqueue above) so it can't race a concurrent pull.
export function forceUpload(userId: string): Promise<UploadCounts> {
  return enqueue(() => runForceUpload(userId));
}

async function runForceUpload(userId: string): Promise<UploadCounts> {
  setStatus('syncing');
  try {
    const counts = await upsertAllToSupabase(userId);
    setStatus('idle');
    return counts;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync] force upload failed:', msg);
    setStatus('error', msg);
    throw err;
  }
}

// ── Hydration ───────────────────────────────────────────────────

// Merge strategy: per-ID, newest `updatedAt` wins; a remote row with `deleted_at` set
// removes the local entry outright (soft-delete tombstone — see 013_soft_delete.sql).
// A local-only entry (no remote row at all, e.g. created while offline and never yet
// uploaded) is left untouched either way, since it's neither a live remote row nor a
// tombstone. This replaces the old "remote always wins on shared ID" merge, which
// silently reverted any local edit (including un-archiving) made to an already-synced
// item, and could never propagate a deletion made on another device.
// `Tag` has no `updatedAt` in the domain model — for it, a missing timestamp falls
// back to the old "remote wins" behavior (still tombstone-aware), rather than adding
// a field this fix doesn't otherwise need.
function mergeRecords<T>(
  local: Record<string, T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[] | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rowToItem: (r: any) => T,
): Record<string, T> {
  const result: Record<string, T> = { ...local };
  for (const row of rows ?? []) {
    const id = row.id as string;
    if (row.deleted_at) {
      delete result[id];
      continue;
    }
    const item = rowToItem(row);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingUpdatedAt = (result[id] as any)?.updatedAt;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemUpdatedAt = (item as any).updatedAt;
    const existingTime = existingUpdatedAt ? new Date(existingUpdatedAt).getTime() : -Infinity;
    const itemTime      = itemUpdatedAt     ? new Date(itemUpdatedAt).getTime()     : Infinity;
    if (!result[id] || itemTime >= existingTime) {
      result[id] = item;
    }
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hydrateStores(...args: Array<any[] | null>) {
  const [
    dbTasks, dbCollections, dbTags, dbPurposes, dbEvents, dbReminders, dbEntries,
    dbSchedules, dbLists, dbListItems, dbListTypes,
  ] = args;

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useTaskStore.setState((local) => ({
    tasks:       mergeRecords(local.tasks,       dbTasks,       rowToTask),
    collections: mergeRecords(local.collections, dbCollections, rowToCollection),
    tags:        mergeRecords(local.tags,        dbTags,        rowToTag),
    purposes:    mergeRecords(local.purposes,    dbPurposes,    rowToPurpose),
  }) as Parameters<typeof useTaskStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useCalendarStore.setState((local) => ({
    events:    mergeRecords(local.events,    dbEvents,    rowToEvent),
    reminders: mergeRecords(local.reminders, dbReminders, rowToReminder),
  }) as Parameters<typeof useCalendarStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useTrackerStore.setState((local) => ({
    entries: mergeRecords(local.entries, dbEntries, rowToEntry),
  }) as Parameters<typeof useTrackerStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useScheduleStore.setState((local) => ({
    schedules: mergeRecords(local.schedules, dbSchedules, rowToSchedule),
  }) as Parameters<typeof useScheduleStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useListStore.setState((local) => ({
    lists:     mergeRecords(local.lists,     dbLists,     rowToList),
    listItems: mergeRecords(local.listItems, dbListItems, rowToListItem),
    // Built-ins in `local.listTypes` are preserved untouched by mergeRecords (remote
    // never contains their fixed ids); only the custom entries can be added/updated/
    // tombstoned here.
    listTypes: mergeRecords(local.listTypes, dbListTypes, rowToListType),
  }) as Parameters<typeof useListStore.setState>[0]);
}

// ── Upload ──────────────────────────────────────────────────────
// Upserts all current store data. Safe to call multiple times.

async function upsertAllToSupabase(userId: string): Promise<UploadCounts> {
  const { tasks, collections, tags, purposes } = useTaskStore.getState();
  const { events, reminders } = useCalendarStore.getState();
  const { entries } = useTrackerStore.getState();
  const { schedules } = useScheduleStore.getState();
  const { lists, listItems, listTypes } = useListStore.getState();

  const allTasks       = Object.values(tasks);
  const allCollections = Object.values(collections);
  const allTags        = Object.values(tags);
  const allPurposes    = Object.values(purposes);
  const allEvents      = Object.values(events);
  const allReminders   = Object.values(reminders);
  const allEntries     = Object.values(entries);
  const allSchedules   = Object.values(schedules);
  const allLists       = Object.values(lists);
  const allListItems   = Object.values(listItems);
  const allListTypes   = Object.values(customListTypes(listTypes));

  const results = await Promise.all([
    allTasks.length       > 0 ? supabase.from('tasks').upsert(allTasks.map((t) => taskToRow(t, userId)))               : null,
    allCollections.length > 0 ? supabase.from('collections').upsert(allCollections.map((c) => collectionToRow(c, userId))) : null,
    allTags.length        > 0 ? supabase.from('tags').upsert(allTags.map((t) => tagToRow(t, userId)))                  : null,
    allPurposes.length    > 0 ? supabase.from('purposes').upsert(allPurposes.map((p) => purposeToRow(p, userId)))      : null,
    allEvents.length      > 0 ? supabase.from('calendar_events').upsert(allEvents.map((e) => eventToRow(e, userId)))   : null,
    allReminders.length   > 0 ? supabase.from('calendar_reminders').upsert(allReminders.map((r) => reminderToRow(r, userId))) : null,
    allEntries.length     > 0 ? supabase.from('tracker_entries').upsert(allEntries.map((e) => entryToRow(e, userId)))  : null,
    allSchedules.length   > 0 ? supabase.from('schedules').upsert(allSchedules.map((s) => scheduleToRow(s, userId)))   : null,
    allLists.length       > 0 ? supabase.from('lists').upsert(allLists.map((l) => listToRow(l, userId)))               : null,
    allListItems.length   > 0 ? supabase.from('list_items').upsert(allListItems.map((i) => listItemToRow(i, userId))) : null,
    allListTypes.length   > 0 ? supabase.from('list_types').upsert(allListTypes.map((t) => listTypeToRow(t, userId))) : null,
  ]);

  const firstError = results.find((r) => r?.error)?.error;
  if (firstError) throw new Error(firstError.message);

  return {
    tasks: allTasks.length, collections: allCollections.length, tags: allTags.length,
    purposes: allPurposes.length, events: allEvents.length, reminders: allReminders.length,
    entries: allEntries.length, schedules: allSchedules.length, lists: allLists.length,
    listItems: allListItems.length, listTypes: allListTypes.length,
  };
}

// ── Subscriptions ───────────────────────────────────────────────

function setupSubscriptions(userId: string): void {
  const unsubTask = useTaskStore.subscribe((state, prev) => {
    if (hydrating) return;

    if (state.tasks !== prev.tasks)
      syncDiff('tasks', prev.tasks, state.tasks, (t) => taskToRow(t as Task, userId));

    if (state.collections !== prev.collections)
      syncDiff('collections', prev.collections, state.collections, (c) => collectionToRow(c as Collection, userId));

    if (state.tags !== prev.tags)
      syncDiff('tags', prev.tags, state.tags, (t) => tagToRow(t as Tag, userId));

    if (state.purposes !== prev.purposes)
      syncDiff('purposes', prev.purposes, state.purposes, (p) => purposeToRow(p as Purpose, userId));
  });

  const unsubCal = useCalendarStore.subscribe((state, prev) => {
    if (hydrating) return;

    if (state.events !== prev.events)
      syncDiff('calendar_events', prev.events, state.events, (e) => eventToRow(e as CalendarEvent, userId));

    if (state.reminders !== prev.reminders)
      syncDiff('calendar_reminders', prev.reminders, state.reminders, (r) => reminderToRow(r as CalendarReminder, userId));
  });

  const unsubTracker = useTrackerStore.subscribe((state, prev) => {
    if (hydrating) return;

    if (state.entries !== prev.entries)
      syncDiff('tracker_entries', prev.entries, state.entries, (e) => entryToRow(e as TrackerEntry, userId));
  });

  const unsubSchedule = useScheduleStore.subscribe((state, prev) => {
    if (hydrating) return;

    if (state.schedules !== prev.schedules)
      syncDiff('schedules', prev.schedules, state.schedules, (s) => scheduleToRow(s as ScheduleTemplate, userId));
  });

  const unsubList = useListStore.subscribe((state, prev) => {
    if (hydrating) return;

    if (state.lists !== prev.lists)
      syncDiff('lists', prev.lists, state.lists, (l) => listToRow(l as List, userId));

    if (state.listItems !== prev.listItems)
      syncDiff('list_items', prev.listItems, state.listItems, (i) => listItemToRow(i as ListItem, userId));

    if (state.listTypes !== prev.listTypes)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      syncDiff('list_types', customListTypes(prev.listTypes as any), customListTypes(state.listTypes as any), (t) => listTypeToRow(t as ListType, userId));
  });

  unsubscribers = [unsubTask, unsubCal, unsubTracker, unsubSchedule, unsubList];
}

// ── Diff + sync ─────────────────────────────────────────────────

function syncDiff(
  table: string,
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  toRow: (item: unknown) => Record<string, unknown>,
): void {
  const toUpsert: Record<string, unknown>[] = [];
  const toDelete: string[] = [];

  for (const [id, item] of Object.entries(next)) {
    if (item !== prev[id]) toUpsert.push(toRow(item));
  }
  for (const id of Object.keys(prev)) {
    if (!(id in next)) toDelete.push(id);
  }

  if (toUpsert.length > 0) {
    supabase.from(table).upsert(toUpsert).then(({ error }) => {
      if (error) { console.error(`[sync] upsert ${table}:`, error.message); setStatus('error', error.message); }
    });
  }
  if (toDelete.length > 0) {
    // Soft delete (tombstone), not a hard DELETE — a hard delete leaves no trace for
    // another device's next hydrateStores() to distinguish "deleted elsewhere" from
    // "never uploaded from here," so a deletion could never propagate across devices.
    supabase.from(table).update({ deleted_at: new Date().toISOString() }).in('id', toDelete).then(({ error }) => {
      if (error) { console.error(`[sync] delete ${table}:`, error.message); setStatus('error', error.message); }
    });
  }
}
