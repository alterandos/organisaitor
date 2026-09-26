// Automatic local backup — a background safety net, independent of Supabase sync entirely.
// Confirmed requirement (2026-09-15 sync-gap incident; sharpened 2026-09-25 after a real note
// content overwrite — see BACKLOG.md "Automatic local backup rotation"). Change-volume
// triggered ONLY, no time-based trigger (confirmed with the user 2026-09-25): a snapshot fires
// once enough has actually changed, never just because a clock interval elapsed.
//
// Reuses machinery that already exists rather than inventing a new backup format: a snapshot
// is exactly what utils/backupExport.ts's buildBackupSnapshot() produces (the same thing the
// manual "Export backup" button downloads), stored via services/autoBackupStorage.ts (its own
// IndexedDB database, deliberately separate from the notes/trash one), thinned by
// utils/backupRetention.ts's pure grandfather-rotation algorithm.
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useRoutineStore } from '@/store/routineStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useFitnessStore } from '@/store/fitnessStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { buildBackupSnapshot } from '@/utils/backupExport';
import { saveBackupSnapshot, listBackupSnapshots, deleteBackupSnapshot } from '@/services/autoBackupStorage';
import { selectSnapshotsToKeep } from '@/utils/backupRetention';

// Per-device bookkeeping, not user data — same category as syncService.ts's
// 'todo-sync-pending', deliberately NOT in PERSISTED_STORAGE_KEYS (config/backup.ts): it's the
// running progress toward the next snapshot, not something a restore should ever touch.
const SCORE_KEY = 'todo-autobackup-score';

// ~50 characters of note-CONTENT change ≈ 1 "change point" — free-text edits are weighted by
// how much text actually changed rather than counted as a flat +1 like a task/event, so a full
// page of typing counts for meaningfully more than a title tweak. Record-shaped stores
// (tasks, events, list items, …) are simpler: +1 per item created/updated/deleted, same
// reference-inequality diff convention services/sync/syncService.ts's trackChanges already
// uses for the same "did this record actually change" question.
const NOTE_CHARS_PER_POINT = 50;

let score = 0;
let unsubscribers: Array<() => void> = [];
let started = false;
let snapshotInFlight = false;
let snapshotPending = false;

function loadScore(): number {
  try { return Number(localStorage.getItem(SCORE_KEY)) || 0; } catch { return 0; }
}
function saveScore(v: number): void {
  try { localStorage.setItem(SCORE_KEY, String(v)); } catch { /* best-effort — a lost score just means the next change re-counts from 0 */ }
}

type Records = Record<string, unknown>;

function diffRecordWeight(prev: Records, next: Records): number {
  let n = 0;
  for (const [id, item] of Object.entries(next)) if (item !== prev[id]) n++;
  for (const id of Object.keys(prev)) if (!(id in next)) n++;
  return n;
}

function diffNotesWeight(prev: Records, next: Records): number {
  let n = 0;
  for (const [id, item] of Object.entries(next)) {
    const before = prev[id] as { content?: string } | undefined;
    if (item === before) continue;
    if (!before) { n += 1; continue; } // a brand-new note — flat weight, nothing to delta against
    const after = item as { content?: string };
    const charDelta = Math.abs((after.content?.length ?? 0) - (before.content?.length ?? 0));
    n += charDelta > 0 ? Math.max(1, Math.round(charDelta / NOTE_CHARS_PER_POINT)) : 1;
  }
  for (const id of Object.keys(prev)) if (!(id in next)) n++;
  return n;
}

async function takeSnapshotAndRotate(): Promise<void> {
  const backup = await buildBackupSnapshot();
  const id = await saveBackupSnapshot(JSON.stringify(backup));
  if (id === null) return; // couldn't save (IndexedDB unavailable, quota, …) — leave the score
                            // as-is so the next change retries rather than silently losing progress

  score = 0;
  saveScore(0);

  const targetAgesDays = useSettingsStore.getState().autoBackupTargetAgesDays;
  const all = await listBackupSnapshots();
  const keep = selectSnapshotsToKeep(all, targetAgesDays);
  for (const snap of all) if (!keep.has(snap.id)) await deleteBackupSnapshot(snap.id);
}

// buildBackupSnapshot()+saveBackupSnapshot() are async, and score only resets to 0 once that
// completes — so two changes that both cross the threshold before the first snapshot finishes
// must not both start a snapshot (the second would run against a stale score and immediately
// fire again). snapshotInFlight/snapshotPending collapse any such burst into one snapshot, with
// one retry check after it finishes in case score crossed the threshold again meanwhile.
function addScore(delta: number): void {
  if (delta <= 0) return;
  score += delta;
  saveScore(score);
  maybeSnapshot();
}

function maybeSnapshot(): void {
  if (score < useSettingsStore.getState().autoBackupChangeThreshold) return;
  if (snapshotInFlight) { snapshotPending = true; return; }
  snapshotInFlight = true;
  void takeSnapshotAndRotate().finally(() => {
    snapshotInFlight = false;
    if (snapshotPending) { snapshotPending = false; maybeSnapshot(); }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Watchable = { subscribe: (listener: (state: any, prev: any) => void) => () => void };

function watch(store: Watchable, fields: Array<{ prop: string; weight?: (prev: Records, next: Records) => number }>): () => void {
  return store.subscribe((state, prev) => {
    for (const f of fields) {
      if (state[f.prop] === prev[f.prop]) continue;
      const weightFn = f.weight ?? diffRecordWeight;
      addScore(weightFn(prev[f.prop], state[f.prop]));
    }
  });
}

function subscribeAll(): Array<() => void> {
  return [
    watch(useTaskStore, [{ prop: 'tasks' }, { prop: 'collections' }, { prop: 'tags' }, { prop: 'purposes' }]),
    watch(useCalendarStore, [{ prop: 'events' }, { prop: 'reminders' }]),
    watch(useScheduleStore, [{ prop: 'schedules' }]),
    watch(useTrackerStore, [{ prop: 'entries' }]),
    watch(useRoutineStore, [{ prop: 'instances' }]),
    watch(useNoteStore, [{ prop: 'notes', weight: diffNotesWeight }, { prop: 'noteTags' }, { prop: 'structuredTagEntries' }]),
    watch(useListStore, [{ prop: 'lists' }, { prop: 'listItems' }, { prop: 'listTypes' }]),
    watch(useFitnessStore, [{ prop: 'activities' }, { prop: 'activityTypes' }]),
    watch(usePortfolioStore, [{ prop: 'watchlistItems' }, { prop: 'portfolioTags' }, { prop: 'investmentPurposes' }]),
  ];
}

// Called once at app startup (App.tsx). Reactive to the Settings toggle — turning it off
// immediately stops tracking (and any in-flight score is preserved, not discarded, so turning
// it back on later resumes from where it left off rather than needing to re-accumulate).
export function initAutoBackup(): void {
  if (started) return;
  started = true;
  score = loadScore();

  const apply = (enabled: boolean) => {
    if (enabled && unsubscribers.length === 0) {
      unsubscribers = subscribeAll();
    } else if (!enabled && unsubscribers.length > 0) {
      for (const u of unsubscribers) u();
      unsubscribers = [];
    }
  };

  apply(useSettingsStore.getState().autoBackupEnabled);
  useSettingsStore.subscribe((s, prev) => {
    if (s.autoBackupEnabled !== prev.autoBackupEnabled) apply(s.autoBackupEnabled);
  });
}
