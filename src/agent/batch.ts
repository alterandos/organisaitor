import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useAgentBatchStore } from '@/store/agentBatchStore';
import type { BatchChange, EntityKind } from '@/types/agent';

// How an agent's changes are captured and undone. Zustand state is immutable — every write replaces
// the changed record and leaves the old object untouched — so "the state before" is just a
// reference kept on the way in, and "what changed" is a comparison of references afterwards. That
// records everything a command really did (including a task's linked calendar entries) without
// each command having to declare what it touches.

type Records = Record<string, unknown>;

interface Tracked {
  kind:  EntityKind;
  read:  () => Records;
  write: (next: Records) => void;
}

const TRACKED: Tracked[] = [
  { kind: 'task',      read: () => useTaskStore.getState().tasks,        write: (r) => useTaskStore.setState({ tasks: r as never }) },
  { kind: 'endeavour', read: () => useTaskStore.getState().collections, write: (r) => useTaskStore.setState({ collections: r as never }) },
  { kind: 'purpose',   read: () => useTaskStore.getState().purposes,    write: (r) => useTaskStore.setState({ purposes: r as never }) },
  { kind: 'tag',       read: () => useTaskStore.getState().tags,        write: (r) => useTaskStore.setState({ tags: r as never }) },
  { kind: 'event',     read: () => useCalendarStore.getState().events,    write: (r) => useCalendarStore.setState({ events: r as never }) },
  { kind: 'reminder',  read: () => useCalendarStore.getState().reminders, write: (r) => useCalendarStore.setState({ reminders: r as never }) },
  { kind: 'schedule',  read: () => useScheduleStore.getState().schedules, write: (r) => useScheduleStore.setState({ schedules: r as never }) },
];

const updatedAtOf = (record: unknown): string | null =>
  (record as { updatedAt?: string } | undefined)?.updatedAt ?? null;

export type Snapshot = Map<EntityKind, Records>;

export function takeSnapshot(): Snapshot {
  return new Map(TRACKED.map((t) => [t.kind, t.read()]));
}

export function diffSince(snapshot: Snapshot): BatchChange[] {
  const changes: BatchChange[] = [];
  for (const t of TRACKED) {
    const before = snapshot.get(t.kind) ?? {};
    const after = t.read();
    if (before === after) continue;
    for (const id of Object.keys(after)) {
      if (!(id in before)) changes.push({ kind: t.kind, id, change: 'created', before: null, afterUpdatedAt: updatedAtOf(after[id]) });
      else if (before[id] !== after[id]) changes.push({ kind: t.kind, id, change: 'modified', before: before[id], afterUpdatedAt: updatedAtOf(after[id]) });
    }
    for (const id of Object.keys(before)) {
      if (!(id in after)) changes.push({ kind: t.kind, id, change: 'removed', before: before[id], afterUpdatedAt: null });
    }
  }
  return changes;
}

export interface RevertResult {
  reverted: number;
  skipped:  { kind: EntityKind; id: string; reason: string }[];
}

// Undoes a set of changes. Without `force`, anything the user edited since is left alone and
// reported — an undo must never overwrite the user's own later work. Restored records get a fresh
// updatedAt, because sync merges by it and an old one would lose to a newer copy elsewhere.
export function revertChanges(changes: BatchChange[], force = false): RevertResult {
  const result: RevertResult = { reverted: 0, skipped: [] };
  for (const change of [...changes].reverse()) {
    const tracked = TRACKED.find((t) => t.kind === change.kind);
    if (!tracked) continue;
    const records = { ...tracked.read() };
    const current = records[change.id];
    const editedSince = current !== undefined && change.afterUpdatedAt !== null && updatedAtOf(current) !== change.afterUpdatedAt;

    if (change.change === 'created') {
      if (current === undefined) continue;
      if (editedSince && !force) { result.skipped.push({ kind: change.kind, id: change.id, reason: 'edited since' }); continue; }
      delete records[change.id];
    } else {
      if (editedSince && !force) { result.skipped.push({ kind: change.kind, id: change.id, reason: 'edited since' }); continue; }
      const before = change.before as Record<string, unknown>;
      records[change.id] = 'updatedAt' in before ? { ...before, updatedAt: new Date().toISOString() } : before;
    }
    tracked.write(records);
    result.reverted++;
  }
  return result;
}

export function revertBatch(batchId: string, force = false): RevertResult | null {
  const store = useAgentBatchStore.getState();
  const batch = store.batches.find((b) => b.id === batchId);
  if (!batch || batch.revertedAt) return null;
  const result = revertChanges(batch.changes, force);
  if (result.skipped.length === 0) store.markReverted(batchId);
  return result;
}
