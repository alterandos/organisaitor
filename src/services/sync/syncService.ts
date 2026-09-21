import { supabase } from '@/services/supabase';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import type { Task, Collection, Tag, Purpose, CalendarEvent, CalendarReminder, TrackerEntry, ScheduleTemplate } from '@/types';
import type { List, ListItem, ListType } from '@/types/lists';
import type { Note, NoteTag, StructuredTagEntry } from '@/types/notes';
import type { WatchlistItem, PortfolioTag, InvestmentPurpose } from '@/types/portfolio';
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
  noteToRow,       rowToNote,
  noteTagToRow,    rowToNoteTag,
  structuredTagEntryToRow, rowToStructuredTagEntry,
  watchlistItemToRow,      rowToWatchlistItem,
  portfolioTagToRow,       rowToPortfolioTag,
  investmentPurposeToRow,  rowToInvestmentPurpose,
} from './mappers';

// Custom (non-built-in) list types only — built-ins have fixed ids, are re-seeded
// locally on every load, and are never uploaded or merged from remote.
const customListTypes = (types: Record<string, ListType>) =>
  Object.fromEntries(Object.entries(types).filter(([, t]) => !t.isBuiltIn));

// Suppresses outbound sync while stores are being hydrated from Supabase.
let hydrating = false;
let unsubscribers: Array<() => void> = [];
let currentUserId: string | null = null;

// ── Table registry ──────────────────────────────────────────────
// Every synced table: how to read its current local records and turn one into a row. Used by the
// change tracker, the retry flush and the post-load reconcile below.

type Records = Record<string, unknown>;
interface TableDef { get: () => Records; toRow: (item: unknown, userId: string) => Record<string, unknown> }

const TABLE_DEFS: Record<(typeof SYNC_TABLES)[number], TableDef> = {
  tasks:                  { get: () => useTaskStore.getState().tasks,                  toRow: (i, u) => taskToRow(i as Task, u) },
  collections:            { get: () => useTaskStore.getState().collections,            toRow: (i, u) => collectionToRow(i as Collection, u) },
  tags:                   { get: () => useTaskStore.getState().tags,                   toRow: (i, u) => tagToRow(i as Tag, u) },
  purposes:               { get: () => useTaskStore.getState().purposes,               toRow: (i, u) => purposeToRow(i as Purpose, u) },
  calendar_events:        { get: () => useCalendarStore.getState().events,             toRow: (i, u) => eventToRow(i as CalendarEvent, u) },
  calendar_reminders:     { get: () => useCalendarStore.getState().reminders,          toRow: (i, u) => reminderToRow(i as CalendarReminder, u) },
  tracker_entries:        { get: () => useTrackerStore.getState().entries,             toRow: (i, u) => entryToRow(i as TrackerEntry, u) },
  schedules:              { get: () => useScheduleStore.getState().schedules,          toRow: (i, u) => scheduleToRow(i as ScheduleTemplate, u) },
  lists:                  { get: () => useListStore.getState().lists,                  toRow: (i, u) => listToRow(i as List, u) },
  list_items:             { get: () => useListStore.getState().listItems,              toRow: (i, u) => listItemToRow(i as ListItem, u) },
  list_types:             { get: () => customListTypes(useListStore.getState().listTypes as Record<string, ListType>), toRow: (i, u) => listTypeToRow(i as ListType, u) },
  notes:                  { get: () => useNoteStore.getState().notes,                  toRow: (i, u) => noteToRow(i as Note, u) },
  note_tags:              { get: () => useNoteStore.getState().noteTags,               toRow: (i, u) => noteTagToRow(i as NoteTag, u) },
  structured_tag_entries: { get: () => useNoteStore.getState().structuredTagEntries,   toRow: (i, u) => structuredTagEntryToRow(i as StructuredTagEntry, u) },
  watchlist_items:        { get: () => usePortfolioStore.getState().watchlistItems,    toRow: (i, u) => watchlistItemToRow(i as WatchlistItem, u) },
  portfolio_tags:         { get: () => usePortfolioStore.getState().portfolioTags,     toRow: (i, u) => portfolioTagToRow(i as PortfolioTag, u) },
  investment_purposes:    { get: () => usePortfolioStore.getState().investmentPurposes, toRow: (i, u) => investmentPurposeToRow(i as InvestmentPurpose, u) },
};

// ── Pending changes ─────────────────────────────────────────────
// Every local change is recorded here BEFORE it is sent, and forgotten only once Supabase has
// accepted it. That is what makes sync survive being offline, a failed request, or the window
// closing mid-request: the record lives in localStorage, so the next launch (or the next retry)
// pushes whatever is still in it. Entries are just "this row id changed"; what is sent is always
// the row's CURRENT local state, or a soft-delete if it no longer exists locally — so several
// edits collapse into one push and a delete made offline is not lost.
//
// Deliberately not in PERSISTED_STORAGE_KEYS (config/backup.ts): it is per-device, per-account
// sync bookkeeping, and restoring it from a backup would replay stale changes. It is discarded when
// the signed-in account differs, and on sign-out (clearPendingSync, called by authStore).

const PENDING_KEY = 'todo-sync-pending';
const RETRY_EVERY_MS = 60_000;

interface PendingState { userId: string; tables: Record<string, Record<string, number>> }
let pending: PendingState | null = null;
let pendingSeq = 0;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let onlineListener: (() => void) | null = null;
// True while the sync status is 'error' because a PUSH failed (as opposed to a failed initial load),
// so a later fully-successful flush knows it may clear it.
let pushFailed = false;

function loadPending(userId: string) {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const stored = raw ? (JSON.parse(raw) as PendingState) : null;
    pending = stored && stored.userId === userId ? stored : { userId, tables: {} };
    // Another account's leftovers are dropped from disk too, not just from memory.
    if (stored && stored.userId !== userId) savePending();
  } catch {
    pending = { userId, tables: {} };
  }
}

function savePending() {
  try {
    if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // A full localStorage here only costs the restart-safety of the queue; the in-memory copy and
    // this session's retries still work.
  }
}

// Forgets every pending change. For sign-out, after the local data has been wiped.
export function clearPendingSync(): void {
  pending = null;
  try { localStorage.removeItem(PENDING_KEY); } catch { /* nothing to clear */ }
}

function markDirty(table: string, ids: string[]) {
  if (!pending) return;
  const t = (pending.tables[table] ??= {});
  for (const id of ids) t[id] = ++pendingSeq;
  savePending();
}

const dirtyIds = (table: string): string[] => Object.keys(pending?.tables[table] ?? {});
const pendingCount = () => Object.values(pending?.tables ?? {}).reduce((n, t) => n + Object.keys(t).length, 0);

// Sends the given rows' current state (or a soft-delete for one that no longer exists locally) and,
// only on success, forgets them — unless the row changed again while the request was in flight, in
// which case its newer entry stays for the next push. Returns whether everything was accepted.
async function pushIds(userId: string, table: keyof typeof TABLE_DEFS, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const def = TABLE_DEFS[table];
  const records = def.get();
  const sent = new Map(ids.map((id) => [id, pending?.tables[table]?.[id]]));
  const upserts: Record<string, unknown>[] = [];
  const deletes: string[] = [];
  for (const id of ids) {
    if (id in records) upserts.push(def.toRow(records[id], userId));
    else deletes.push(id);
  }

  let error: string | null = null;
  try {
    if (upserts.length > 0) {
      const res = await supabase.from(table).upsert(upserts);
      if (res.error) error = res.error.message;
    }
    if (!error && deletes.length > 0) {
      // Soft delete (tombstone), not a hard DELETE — a hard delete leaves no trace for another
      // device's next hydrateStores() to distinguish "deleted elsewhere" from "never uploaded from
      // here", so a deletion could never propagate across devices.
      const res = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).in('id', deletes);
      if (res.error) error = res.error.message;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (error) {
    console.error(`[sync] push ${table}:`, error);
    if (syncStatus !== 'syncing') { pushFailed = true; setStatus('error', `${error} — will retry (${pendingCount()} change${pendingCount() === 1 ? '' : 's'} waiting)`); }
    return false;
  }

  const t = pending?.tables[table];
  if (t) {
    for (const id of ids) if (t[id] === sent.get(id)) delete t[id];
    if (Object.keys(t).length === 0) delete pending!.tables[table];
    savePending();
  }
  if (pushFailed && pendingCount() === 0 && syncStatus !== 'syncing') { pushFailed = false; setStatus('idle'); }
  return true;
}

// Pushes everything still pending, table by table. Called after each load, when the browser comes
// back online, and every RETRY_EVERY_MS while anything is waiting.
let flushing: Promise<void> | null = null;
function flushPending(userId: string): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      for (const table of Object.keys(TABLE_DEFS) as Array<keyof typeof TABLE_DEFS>) {
        const ids = dirtyIds(table);
        if (ids.length > 0) await pushIds(userId, table, ids);
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

// After the load's merge: anything that exists only here (created offline, or before signing in),
// or is newer here than in Supabase (edited offline, or in the moment between the app opening and
// the load finishing), is queued for upload. hydrateStores keeps such items but never used to send
// them. Only tables that loaded are considered — an unreadable table could be hiding remote data.
// Tables whose records carry no updatedAt (tags, list types, portfolio tags/purposes) can only be
// detected as "not there yet"; a local edit to one of those while offline still loses to the cloud.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queueLocalOnlyAndNewer(remote: Record<string, any[] | null>) {
  for (const table of Object.keys(TABLE_DEFS) as Array<keyof typeof TABLE_DEFS>) {
    const rows = remote[table];
    if (!rows) continue;
    const byId = new Map<string, { updated_at?: string; deleted_at?: string | null }>(rows.map((r) => [r.id as string, r]));
    const ids: string[] = [];
    for (const [id, item] of Object.entries(TABLE_DEFS[table].get())) {
      const row = byId.get(id);
      if (!row) { ids.push(id); continue; }
      if (row.deleted_at) continue;
      const local = (item as { updatedAt?: string }).updatedAt;
      if (local && row.updated_at && Date.parse(local) > Date.parse(row.updated_at)) ids.push(id);
    }
    if (ids.length > 0) markDirty(table, ids);
  }
}

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

// Same order as the Promise.all fetch list in runInitSync — index i of one is index i of the other.
const SYNC_TABLES = [
  'tasks', 'collections', 'tags', 'purposes', 'calendar_events', 'calendar_reminders',
  'tracker_entries', 'schedules', 'lists', 'list_items', 'list_types',
  'notes', 'note_tags', 'structured_tag_entries',
  'watchlist_items', 'portfolio_tags', 'investment_purposes',
] as const;

export function initSync(userId: string): Promise<void> {
  return enqueue(() => runInitSync(userId));
}

async function runInitSync(userId: string): Promise<void> {
  stopSync();
  loadPending(userId);
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
      supabase.from('notes').select('*').eq('user_id', userId),
      supabase.from('note_tags').select('*').eq('user_id', userId),
      supabase.from('structured_tag_entries').select('*').eq('user_id', userId),
      supabase.from('watchlist_items').select('*').eq('user_id', userId),
      supabase.from('portfolio_tags').select('*').eq('user_id', userId),
      supabase.from('investment_purposes').select('*').eq('user_id', userId),
    ]);

    // A table that fails to load (missing grant/migration, transient error) must not stop
    // every OTHER table from syncing — it used to (one all-or-nothing throw), which meant
    // e.g. a not-yet-migrated Portfolio table blocked Tasks/Trackers from hydrating at all.
    // Failed tables come back as null (a no-op for mergeRecords), are named in the status
    // error afterward, and suppress the "looks empty, so push local up" branch below, since
    // an unreadable table could be hiding real remote data.
    const failed = SYNC_TABLES.filter((_, i) => results[i].error);
    for (const [i, name] of SYNC_TABLES.entries()) {
      if (results[i].error) console.error(`[sync] could not load ${name}:`, results[i].error!.message);
    }

    const [
      dbTasks, dbCollections, dbTags, dbPurposes, dbEvents, dbReminders, dbEntries,
      dbSchedules, dbLists, dbListItems, dbListTypes,
      dbNotes, dbNoteTags, dbStructuredTagEntries,
      dbWatchlistItems, dbPortfolioTags, dbInvestmentPurposes,
    ] = results.map((r) => (r.error ? null : r.data));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const liveCount = (rows: any[] | null) => (rows ?? []).filter((r) => !r.deleted_at).length;
    const isEmpty =
      liveCount(dbTasks) === 0 &&
      liveCount(dbCollections) === 0 &&
      liveCount(dbEvents) === 0 &&
      liveCount(dbSchedules) === 0 &&
      liveCount(dbLists) === 0 &&
      liveCount(dbNotes) === 0 &&
      liveCount(dbWatchlistItems) === 0;

    if (isEmpty && failed.length === 0) {
      await upsertAllToSupabase(userId);
    } else {
      hydrateStores(
        dbTasks, dbCollections, dbTags, dbPurposes, dbEvents, dbReminders, dbEntries,
        dbSchedules, dbLists, dbListItems, dbListTypes,
        dbNotes, dbNoteTags, dbStructuredTagEntries,
        dbWatchlistItems, dbPortfolioTags, dbInvestmentPurposes,
      );
      queueLocalOnlyAndNewer(Object.fromEntries(SYNC_TABLES.map((t, i) => [t, results[i].error ? null : results[i].data])));
    }

    if (failed.length > 0) setStatus('error', `Could not sync: ${failed.join(', ')} (other data synced normally)`);
    else setStatus('idle');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync] init failed:', msg);
    setStatus('error', msg);
  } finally {
    hydrating = false;
  }

  setupSubscriptions(userId);
  if (pendingCount() > 0) void flushPending(userId);
}

export function stopSync(): void {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  if (onlineListener) { window.removeEventListener('online', onlineListener); onlineListener = null; }
  currentUserId = null;
}

export type UploadCounts = {
  tasks: number; collections: number; tags: number; purposes: number;
  events: number; reminders: number; entries: number;
  schedules: number; lists: number; listItems: number; listTypes: number;
  notes: number; noteTags: number; structuredTagEntries: number;
  watchlistItems: number; portfolioTags: number; investmentPurposes: number;
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
    // upsertAll only sends what exists; deletions made offline are pending soft-deletes.
    void flushPending(userId);
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
  table: string,
): Record<string, T> {
  const result: Record<string, T> = { ...local };
  // Rows deleted on THIS device whose soft-delete hasn't reached the cloud yet (deleted offline, or
  // the request failed): the cloud still has them alive, but they must not come back.
  const deletedHere = new Set(dirtyIds(table).filter((id) => !(id in local)));
  for (const row of rows ?? []) {
    const id = row.id as string;
    if (row.deleted_at) {
      delete result[id];
      continue;
    }
    if (deletedHere.has(id)) continue;
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
    dbNotes, dbNoteTags, dbStructuredTagEntries,
    dbWatchlistItems, dbPortfolioTags, dbInvestmentPurposes,
  ] = args;

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useTaskStore.setState((local) => ({
    tasks:       mergeRecords(local.tasks,       dbTasks,       rowToTask, 'tasks'),
    collections: mergeRecords(local.collections, dbCollections, rowToCollection, 'collections'),
    tags:        mergeRecords(local.tags,        dbTags,        rowToTag, 'tags'),
    purposes:    mergeRecords(local.purposes,    dbPurposes,    rowToPurpose, 'purposes'),
  }) as Parameters<typeof useTaskStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useCalendarStore.setState((local) => ({
    events:    mergeRecords(local.events,    dbEvents,    rowToEvent, 'calendar_events'),
    reminders: mergeRecords(local.reminders, dbReminders, rowToReminder, 'calendar_reminders'),
  }) as Parameters<typeof useCalendarStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useTrackerStore.setState((local) => ({
    entries: mergeRecords(local.entries, dbEntries, rowToEntry, 'tracker_entries'),
  }) as Parameters<typeof useTrackerStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useScheduleStore.setState((local) => ({
    schedules: mergeRecords(local.schedules, dbSchedules, rowToSchedule, 'schedules'),
  }) as Parameters<typeof useScheduleStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useListStore.setState((local) => ({
    lists:     mergeRecords(local.lists,     dbLists,     rowToList, 'lists'),
    listItems: mergeRecords(local.listItems, dbListItems, rowToListItem, 'list_items'),
    // Built-ins in `local.listTypes` are preserved untouched by mergeRecords (remote
    // never contains their fixed ids); only the custom entries can be added/updated/
    // tombstoned here.
    listTypes: mergeRecords(local.listTypes, dbListTypes, rowToListType, 'list_types'),
  }) as Parameters<typeof useListStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  useNoteStore.setState((local) => ({
    notes:                mergeRecords(local.notes,                dbNotes,                rowToNote, 'notes'),
    noteTags:              mergeRecords(local.noteTags,              dbNoteTags,             rowToNoteTag, 'note_tags'),
    structuredTagEntries: mergeRecords(local.structuredTagEntries, dbStructuredTagEntries, rowToStructuredTagEntry, 'structured_tag_entries'),
  }) as Parameters<typeof useNoteStore.setState>[0]);

  // @ts-expect-error — setState updater param typed loosely against the full store shape
  usePortfolioStore.setState((local) => ({
    watchlistItems:     mergeRecords(local.watchlistItems,     dbWatchlistItems,     rowToWatchlistItem, 'watchlist_items'),
    portfolioTags:      mergeRecords(local.portfolioTags,      dbPortfolioTags,      rowToPortfolioTag, 'portfolio_tags'),
    investmentPurposes: mergeRecords(local.investmentPurposes, dbInvestmentPurposes, rowToInvestmentPurpose, 'investment_purposes'),
  }) as Parameters<typeof usePortfolioStore.setState>[0]);
}

// ── Upload ──────────────────────────────────────────────────────
// Upserts all current store data. Safe to call multiple times.

async function upsertAllToSupabase(userId: string): Promise<UploadCounts> {
  const { tasks, collections, tags, purposes } = useTaskStore.getState();
  const { events, reminders } = useCalendarStore.getState();
  const { entries } = useTrackerStore.getState();
  const { schedules } = useScheduleStore.getState();
  const { lists, listItems, listTypes } = useListStore.getState();
  const { notes, noteTags, structuredTagEntries } = useNoteStore.getState();
  const { watchlistItems, portfolioTags, investmentPurposes } = usePortfolioStore.getState();

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
  const allNotes       = Object.values(notes);
  const allNoteTags    = Object.values(noteTags);
  const allStructuredTagEntries = Object.values(structuredTagEntries);
  const allWatchlistItems     = Object.values(watchlistItems);
  const allPortfolioTags      = Object.values(portfolioTags);
  const allInvestmentPurposes = Object.values(investmentPurposes);

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
    allNotes.length       > 0 ? supabase.from('notes').upsert(allNotes.map((n) => noteToRow(n, userId)))               : null,
    allNoteTags.length    > 0 ? supabase.from('note_tags').upsert(allNoteTags.map((t) => noteTagToRow(t, userId)))     : null,
    allStructuredTagEntries.length > 0 ? supabase.from('structured_tag_entries').upsert(allStructuredTagEntries.map((e) => structuredTagEntryToRow(e, userId))) : null,
    allWatchlistItems.length     > 0 ? supabase.from('watchlist_items').upsert(allWatchlistItems.map((i) => watchlistItemToRow(i, userId)))         : null,
    allPortfolioTags.length      > 0 ? supabase.from('portfolio_tags').upsert(allPortfolioTags.map((t) => portfolioTagToRow(t, userId)))            : null,
    allInvestmentPurposes.length > 0 ? supabase.from('investment_purposes').upsert(allInvestmentPurposes.map((p) => investmentPurposeToRow(p, userId))) : null,
  ]);

  const firstError = results.find((r) => r?.error)?.error;
  if (firstError) throw new Error(firstError.message);

  return {
    tasks: allTasks.length, collections: allCollections.length, tags: allTags.length,
    purposes: allPurposes.length, events: allEvents.length, reminders: allReminders.length,
    entries: allEntries.length, schedules: allSchedules.length, lists: allLists.length,
    listItems: allListItems.length, listTypes: allListTypes.length,
    notes: allNotes.length, noteTags: allNoteTags.length, structuredTagEntries: allStructuredTagEntries.length,
    watchlistItems: allWatchlistItems.length, portfolioTags: allPortfolioTags.length, investmentPurposes: allInvestmentPurposes.length,
  };
}

// ── Subscriptions ───────────────────────────────────────────────

// Records each change to a table and pushes it at once (no batching or delay). The record is what
// lets a failed or interrupted push be retried later — see "Pending changes".
function trackChanges(userId: string, table: keyof typeof TABLE_DEFS, prev: Records, next: Records): void {
  const ids: string[] = [];
  for (const [id, item] of Object.entries(next)) if (item !== prev[id]) ids.push(id);
  for (const id of Object.keys(prev)) if (!(id in next)) ids.push(id);
  if (ids.length === 0) return;
  markDirty(table, ids);
  void pushIds(userId, table, ids);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Watchable = { subscribe: (listener: (state: any, prev: any) => void) => () => void };

// Subscribes to one store, tracking the listed record-maps (store property → table). List types
// pass `only` so built-ins (never synced) are ignored.
function watch(
  userId: string,
  store: Watchable,
  fields: Array<{ prop: string; table: keyof typeof TABLE_DEFS; only?: (r: Records) => Records }>,
): () => void {
  return store.subscribe((state, prev) => {
    if (hydrating) return;
    for (const f of fields) {
      if (state[f.prop] === prev[f.prop]) continue;
      const a = f.only ? f.only(prev[f.prop]) : prev[f.prop];
      const b = f.only ? f.only(state[f.prop]) : state[f.prop];
      trackChanges(userId, f.table, a, b);
    }
  });
}

function setupSubscriptions(userId: string): void {
  currentUserId = userId;
  unsubscribers = [
    watch(userId, useTaskStore, [
      { prop: 'tasks', table: 'tasks' }, { prop: 'collections', table: 'collections' },
      { prop: 'tags', table: 'tags' },   { prop: 'purposes', table: 'purposes' },
    ]),
    watch(userId, useCalendarStore, [
      { prop: 'events', table: 'calendar_events' }, { prop: 'reminders', table: 'calendar_reminders' },
    ]),
    watch(userId, useTrackerStore,  [{ prop: 'entries', table: 'tracker_entries' }]),
    watch(userId, useScheduleStore, [{ prop: 'schedules', table: 'schedules' }]),
    watch(userId, useListStore, [
      { prop: 'lists', table: 'lists' }, { prop: 'listItems', table: 'list_items' },
      { prop: 'listTypes', table: 'list_types', only: customListTypes as (r: Records) => Records },
    ]),
    watch(userId, useNoteStore, [
      { prop: 'notes', table: 'notes' }, { prop: 'noteTags', table: 'note_tags' },
      { prop: 'structuredTagEntries', table: 'structured_tag_entries' },
    ]),
    watch(userId, usePortfolioStore, [
      { prop: 'watchlistItems', table: 'watchlist_items' }, { prop: 'portfolioTags', table: 'portfolio_tags' },
      { prop: 'investmentPurposes', table: 'investment_purposes' },
    ]),
  ];

  // Retry what didn't get through: when the browser reports it is back online, and on a timer while
  // anything is still waiting.
  onlineListener = () => { if (currentUserId && pendingCount() > 0) void flushPending(currentUserId); };
  window.addEventListener('online', onlineListener);
  retryTimer = setInterval(() => { if (currentUserId && pendingCount() > 0) void flushPending(currentUserId); }, RETRY_EVERY_MS);
}
