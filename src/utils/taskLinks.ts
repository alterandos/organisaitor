import { ITEM_LINK_KINDS, ITEM_LINK_KIND_ORDER } from '@/config/itemLinkKinds';
import type { ItemLink, ItemLinkKind, Task, TaskId } from '@/types';

// The rules for task links (Task.itemLinks), pure so every caller — store, completion flow, list,
// pane, agents later — reads them the same way. A link to a task that no longer exists (deleted,
// possibly sitting in the Recycling Bin) is ignored everywhere rather than cleaned up, so
// restoring that task brings its links back with it.

type Tasks = Record<string, Task>;

// Done for the purpose of links: completed, or archived (confirmed with the user 2026-10-01 — an
// archived task has been resolved one way or another, so it no longer holds anything up).
export const isResolved = (t: Task): boolean => t.completed || t.archived;

export interface TaskRelation {
  kind:      ItemLinkKind;
  direction: 'out' | 'in';   // out = this task owns the link; in = the other task does
  other:     Task;
  reason:    string | null;
  ownerId:   TaskId;         // the task whose itemLinks hold it (for edit/remove)
  targetId:  TaskId;
}

// Every link touching `task`, both directions, in registry order; missing tasks skipped.
export function taskRelations(task: Task, tasks: Tasks): TaskRelation[] {
  const out: TaskRelation[] = [];
  for (const l of task.itemLinks ?? []) {
    const other = tasks[l.targetId];
    if (other) out.push({ kind: l.kind, direction: 'out', other, reason: l.reason, ownerId: task.id, targetId: other.id });
  }
  for (const t of Object.values(tasks)) {
    if (t.id === task.id) continue;
    for (const l of t.itemLinks ?? []) {
      if (l.targetId === task.id) out.push({ kind: l.kind, direction: 'in', other: t, reason: l.reason, ownerId: t.id, targetId: task.id });
    }
  }
  const order = (k: ItemLinkKind) => ITEM_LINK_KIND_ORDER.indexOf(k);
  return out.sort((a, b) => order(a.kind) - order(b.kind) || Number(a.direction === 'in') - Number(b.direction === 'in'));
}

// The tasks this task is directly waiting on and that aren't resolved yet.
export function openBlockers(task: Task, tasks: Tasks): Task[] {
  const seen = new Set<string>();
  const result: Task[] = [];
  for (const l of task.itemLinks ?? []) {
    if (!ITEM_LINK_KINDS[l.kind].blocks || seen.has(l.targetId)) continue;
    const t = tasks[l.targetId];
    if (t && !isResolved(t)) { seen.add(t.id); result.push(t); }
  }
  return result;
}

export const isBlocked = (task: Task, tasks: Tasks): boolean => !isResolved(task) && openBlockers(task, tasks).length > 0;

// Every unresolved task upstream of this one (its blockers, their blockers, …), nearest first —
// what "complete all" completes. Loops can't be created (canAddLink), but this guards anyway.
export function openBlockersDeep(task: Task, tasks: Tasks): Task[] {
  const result: Task[] = [];
  const seen = new Set<string>([task.id]);
  const queue = [task];
  while (queue.length) {
    for (const b of openBlockers(queue.shift()!, tasks)) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      result.push(b);
      queue.push(b);
    }
  }
  return result;
}

// Tasks that were waiting on `resolvedId` and now have nothing left to wait on.
export function unlockedBy(resolvedId: string, tasks: Tasks): Task[] {
  return Object.values(tasks).filter((t) =>
    !isResolved(t)
    && (t.itemLinks ?? []).some((l) => l.targetId === resolvedId && ITEM_LINK_KINDS[l.kind].blocks)
    && openBlockers(t, tasks).length === 0,
  );
}

export type LinkCheck = 'ok' | 'self' | 'missing' | 'hierarchy' | 'duplicate' | 'cycle';

// A task's own parent chain and sub-task tree: already connected, so never offered as links
// (requested by the user 2026-10-01).
export function hierarchyIds(task: Task, tasks: Tasks): Set<string> {
  const ids = new Set<string>();
  for (let p = task.parentId ? tasks[task.parentId] : undefined; p && !ids.has(p.id); p = p.parentId ? tasks[p.parentId] : undefined) ids.add(p.id);
  const stack = [...(task.subtaskIds ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    stack.push(...(tasks[id]?.subtaskIds ?? []));
  }
  return ids;
}

// Whether `ownerId` may gain a `kind` link to `targetId`. The one place these rules live — the
// store action refuses anything but 'ok', and the UI shows LABELS.taskLinks.rejected[result].
export function canAddLink(ownerId: string, kind: ItemLinkKind, targetId: string, tasks: Tasks): LinkCheck {
  if (ownerId === targetId) return 'self';
  const owner = tasks[ownerId];
  const target = tasks[targetId];
  if (!owner || !target) return 'missing';
  if (hierarchyIds(owner, tasks).has(targetId)) return 'hierarchy';
  const def = ITEM_LINK_KINDS[kind];
  const has = (a: Task, b: string) => (a.itemLinks ?? []).some((l) => l.kind === kind && l.targetId === b);
  if (has(owner, targetId) || (def.symmetric && has(target, ownerId))) return 'duplicate';
  // owner would wait on target: a loop if target already (transitively) waits on owner.
  if (def.blocks && waitsOn(target, ownerId, tasks)) return 'cycle';
  return 'ok';
}

function waitsOn(from: Task, onId: string, tasks: Tasks): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const t = stack.pop()!;
    for (const l of t.itemLinks ?? []) {
      if (!ITEM_LINK_KINDS[l.kind].blocks) continue;
      if (l.targetId === onId) return true;
      const next = tasks[l.targetId];
      if (next && !seen.has(next.id)) { seen.add(next.id); stack.push(next); }
    }
  }
  return false;
}

export const makeItemLink = (kind: ItemLinkKind, targetId: string, reason: string | null, createdAt: string): ItemLink =>
  ({ kind, targetType: 'task', targetId, reason: reason?.trim() || null, createdAt });
