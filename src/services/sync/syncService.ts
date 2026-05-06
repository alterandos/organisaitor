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

export async function initSync(userId: string): Promise<void> {
  stopSync();
  hydrating = true;

  try {
    const [
      { data: dbTasks },
      { data: dbCollections },
      { data: dbTags },
      { data: dbPurposes },
      { data: dbEvents },
      { data: dbReminders },
    ] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId),
      supabase.from('collections').select('*').eq('user_id', userId),
      supabase.from('tags').select('*').eq('user_id', userId),
      supabase.from('purposes').select('*').eq('user_id', userId),
      supabase.from('calendar_events').select('*').eq('user_id', userId),
      supabase.from('calendar_reminders').select('*').eq('user_id', userId),
    ]);

    const isEmpty =
      (dbTasks?.length ?? 0) === 0 &&
      (dbCollections?.length ?? 0) === 0 &&
      (dbEvents?.length ?? 0) === 0;

    if (isEmpty) {
      await uploadLocalData(userId);
    } else {
      hydrateStores(dbTasks, dbCollections, dbTags, dbPurposes, dbEvents, dbReminders);
    }
  } catch (err) {
    console.error('[sync] init failed:', err);
  } finally {
    hydrating = false;
  }

  setupSubscriptions(userId);
}

export function stopSync(): void {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
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

// ── Migration ───────────────────────────────────────────────────
// First sign-in: uploads all existing localStorage data to Supabase.

async function uploadLocalData(userId: string): Promise<void> {
  const { tasks, collections, tags, purposes } = useTaskStore.getState();
  const { events, reminders } = useCalendarStore.getState();

  const allTasks       = Object.values(tasks);
  const allCollections = Object.values(collections);
  const allTags        = Object.values(tags);
  const allPurposes    = Object.values(purposes);
  const allEvents      = Object.values(events);
  const allReminders   = Object.values(reminders);

  await Promise.all([
    allTasks.length       > 0 && supabase.from('tasks').insert(allTasks.map((t) => taskToRow(t, userId))),
    allCollections.length > 0 && supabase.from('collections').insert(allCollections.map((c) => collectionToRow(c, userId))),
    allTags.length        > 0 && supabase.from('tags').insert(allTags.map((t) => tagToRow(t, userId))),
    allPurposes.length    > 0 && supabase.from('purposes').insert(allPurposes.map((p) => purposeToRow(p, userId))),
    allEvents.length      > 0 && supabase.from('calendar_events').insert(allEvents.map((e) => eventToRow(e, userId))),
    allReminders.length   > 0 && supabase.from('calendar_reminders').insert(allReminders.map((r) => reminderToRow(r, userId))),
  ]);
}

// ── Subscriptions ───────────────────────────────────────────────
// Watches Zustand stores for changes and mirrors them to Supabase.

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
      if (error) console.error(`[sync] upsert ${table}:`, error.message);
    });
  }
  if (toDelete.length > 0) {
    supabase.from(table).delete().in('id', toDelete).then(({ error }) => {
      if (error) console.error(`[sync] delete ${table}:`, error.message);
    });
  }
}
