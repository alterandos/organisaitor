import { supabase } from '@/services/supabase';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import type { Task, Collection, Tag, Purpose, CalendarEvent, CalendarReminder } from '@/types';
import {
  taskToRow,       rowToTask,
  collectionToRow, rowToCollection,
  tagToRow,        rowToTag,
  purposeToRow,    rowToPurpose,
  eventToRow,      rowToEvent,
  reminderToRow,   rowToReminder,
} from './mappers';

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

export async function initSync(userId: string): Promise<void> {
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
    ]);

    // Surface any permission/connection errors
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      throw new Error(firstError.message);
    }

    const [dbTasks, dbCollections, dbTags, dbPurposes, dbEvents, dbReminders] =
      results.map((r) => r.data);

    const isEmpty =
      (dbTasks?.length ?? 0) === 0 &&
      (dbCollections?.length ?? 0) === 0 &&
      (dbEvents?.length ?? 0) === 0;

    if (isEmpty) {
      await upsertAllToSupabase(userId);
    } else {
      hydrateStores(dbTasks, dbCollections, dbTags, dbPurposes, dbEvents, dbReminders);
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

// Force-uploads ALL current store data to Supabase (upsert).
// Used after restoring from a JSON backup while already signed in.
export async function forceUpload(userId: string): Promise<void> {
  setStatus('syncing');
  try {
    await upsertAllToSupabase(userId);
    setStatus('idle');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync] force upload failed:', msg);
    setStatus('error', msg);
    throw err;
  }
}

// ── Hydration ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hydrateStores(...args: Array<any[] | null>) {
  const [dbTasks, dbCollections, dbTags, dbPurposes, dbEvents, dbReminders] = args;

  useTaskStore.setState({
    tasks:       Object.fromEntries((dbTasks       ?? []).map((r) => { const t = rowToTask(r);       return [t.id, t]; })),
    collections: Object.fromEntries((dbCollections ?? []).map((r) => { const c = rowToCollection(r); return [c.id, c]; })),
    tags:        Object.fromEntries((dbTags        ?? []).map((r) => { const t = rowToTag(r);        return [t.id, t]; })),
    purposes:    Object.fromEntries((dbPurposes    ?? []).map((r) => { const p = rowToPurpose(r);    return [p.id, p]; })),
  } as Parameters<typeof useTaskStore.setState>[0]);

  useCalendarStore.setState({
    events:    Object.fromEntries((dbEvents    ?? []).map((r) => { const e = rowToEvent(r);    return [e.id, e]; })),
    reminders: Object.fromEntries((dbReminders ?? []).map((r) => { const r2 = rowToReminder(r); return [r2.id, r2]; })),
  } as Parameters<typeof useCalendarStore.setState>[0]);
}

// ── Upload ──────────────────────────────────────────────────────
// Upserts all current store data. Safe to call multiple times.

async function upsertAllToSupabase(userId: string): Promise<void> {
  const { tasks, collections, tags, purposes } = useTaskStore.getState();
  const { events, reminders } = useCalendarStore.getState();

  const allTasks       = Object.values(tasks);
  const allCollections = Object.values(collections);
  const allTags        = Object.values(tags);
  const allPurposes    = Object.values(purposes);
  const allEvents      = Object.values(events);
  const allReminders   = Object.values(reminders);

  const results = await Promise.all([
    allTasks.length       > 0 ? supabase.from('tasks').upsert(allTasks.map((t) => taskToRow(t, userId)))               : null,
    allCollections.length > 0 ? supabase.from('collections').upsert(allCollections.map((c) => collectionToRow(c, userId))) : null,
    allTags.length        > 0 ? supabase.from('tags').upsert(allTags.map((t) => tagToRow(t, userId)))                  : null,
    allPurposes.length    > 0 ? supabase.from('purposes').upsert(allPurposes.map((p) => purposeToRow(p, userId)))      : null,
    allEvents.length      > 0 ? supabase.from('calendar_events').upsert(allEvents.map((e) => eventToRow(e, userId)))   : null,
    allReminders.length   > 0 ? supabase.from('calendar_reminders').upsert(allReminders.map((r) => reminderToRow(r, userId))) : null,
  ]);

  const firstError = results.find((r) => r?.error)?.error;
  if (firstError) throw new Error(firstError.message);
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

  unsubscribers = [unsubTask, unsubCal];
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
    supabase.from(table).delete().in('id', toDelete).then(({ error }) => {
      if (error) { console.error(`[sync] delete ${table}:`, error.message); setStatus('error', error.message); }
    });
  }
}
