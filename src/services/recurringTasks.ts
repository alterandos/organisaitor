import { useTaskStore } from '@/store/taskStore';
import { addTaskWithCalendar, updateTaskLinked } from '@/services/taskCalendarLinks';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { deleteForever, trashedBy } from '@/services/trash';
import { expandRepeat } from '@/utils/recurrence';
import { addDaysToIso, todayIso } from '@/utils/date';
import { makeItemLink } from '@/utils/taskLinks';
import { LABELS } from '@/config/labels';
import type { RepeatConfig, Task, TaskId } from '@/types';

// Recurring tasks (decided with the user 2026-10-07): a task with a repeat rule (Task.repeat, the
// calendar's RepeatConfig) has one open occurrence at a time. Completing it creates the next:
//   - dated by the rule from the occurrence's own date (its deadline, else its scheduled day, else
//     today): the first date after it that isn't already past — completing late skips the missed
//     ones rather than piling them up; the deadline and the scheduled day move together;
//   - carrying its title, notes, links, Endeavour, tags, purposes, priority, kind and effort, its
//     links to notes and lists, and its sub-tasks (reset to undone);
//   - linked back to the occurrence it repeats (an ItemLink 'repeatOf').
// "After N times" counts down on each occurrence; "until" stops once the next date would pass it.
// Called by every path that completes a task (services/taskListLinks.ts toggleTaskWithLists for
// the UI, agent/access.ts for agents), so the rule lives here only.

// How far ahead to look for the next date, by frequency (at least one whole step).
const STEP_DAYS: Record<RepeatConfig['freq'], number> = { daily: 1, weekly: 7, monthly: 31, yearly: 366 };

// The next occurrence's date after `basis`: the first the rule gives after it that's today or
// later. null when the rule has ended (its until date has passed, or its count is used up).
export function nextOccurrenceDate(basis: string, repeat: RepeatConfig, today = todayIso()): string | null {
  if (repeat.endKind === 'count' && (repeat.count ?? 0) <= 1) return null;
  const from = addDaysToIso(basis, 1) > today ? addDaysToIso(basis, 1) : today;
  // A window long enough to hold one more occurrence after a late completion.
  const span = STEP_DAYS[repeat.freq] * Math.max(1, repeat.interval) + 1;
  const late = Math.max(0, Math.round((Date.parse(today) - Date.parse(basis)) / 86_400_000));
  const dates = expandRepeat(basis, { ...repeat, endKind: repeat.endKind === 'count' ? 'forever' : repeat.endKind }, from, addDaysToIso(from, span + late));
  return dates[0] ?? null;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const shift = (date: string | null, days: number) => (date ? addDaysToIso(date, days) : null);

// The occurrence that repeats `taskId`, if one exists already.
export function nextOccurrenceOf(taskId: TaskId): Task | null {
  return Object.values(useTaskStore.getState().tasks).find((t) => t.itemLinks?.some((l) => l.kind === 'repeatOf' && l.targetId === taskId)) ?? null;
}

// Creates the next occurrence of a just-completed repeating task. Returns its id, or null if the
// task doesn't repeat (or its rule has ended). Sub-tasks don't repeat on their own: they come
// along with their parent.
export function spawnNextOccurrence(taskId: TaskId, today = todayIso()): TaskId | null {
  const tasks = useTaskStore.getState().tasks;
  const task = tasks[taskId];
  if (!task?.repeat || !task.completed || task.parentId || task.archived) return null;
  const existing = nextOccurrenceOf(taskId);
  if (existing) return existing.id;
  const basis = task.deadline ?? task.scheduledAt ?? today;
  const next = nextOccurrenceDate(basis, task.repeat, today);
  if (!next) return null;
  const delta = daysBetween(basis, next);
  const repeat: RepeatConfig = task.repeat.endKind === 'count'
    ? { ...task.repeat, count: Math.max(1, (task.repeat.count ?? 1) - 1) }
    : task.repeat;
  const hasDate = !!(task.deadline || task.scheduledAt);
  const id = addTaskWithCalendar({
    title:         task.title,
    notes:         task.notes,
    links:         task.links,
    deadline:      hasDate ? shift(task.deadline, delta) : next,
    deadlineTime:  task.deadlineTime,
    scheduledAt:   shift(task.scheduledAt, delta),
    scheduledTime: task.scheduledTime,
    collectionId:  task.collectionId,
    tagIds:        task.tagIds,
    purposeIds:    task.purposeIds,
    priority:      task.priority,
    kind:          task.kind,
    timeIntensity: task.timeIntensity,
    crossAppRefs:  task.crossAppRefs,
    itemLinks:     [makeItemLink('repeatOf', taskId, null, new Date().toISOString())],
    repeat,
  });
  for (const subId of task.subtaskIds ?? []) {
    const sub = tasks[subId];
    if (!sub || sub.archived) continue;
    addTaskWithCalendar({
      title:         sub.title,
      notes:         sub.notes,
      links:         sub.links,
      deadline:      shift(sub.deadline, delta),
      deadlineTime:  sub.deadlineTime,
      scheduledAt:   shift(sub.scheduledAt, delta),
      scheduledTime: sub.scheduledTime,
      priority:      sub.priority,
      kind:          sub.kind,
      timeIntensity: sub.timeIntensity,
      crossAppRefs:  sub.crossAppRefs,
      parentId:      id,
    });
  }
  return id;
}

// Where skipping this occurrence would move it to, or null (not repeating, a sub-task, done,
// archived, or the rule has no date left).
export function skipTarget(taskId: TaskId, today = todayIso()): string | null {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task?.repeat || task.completed || task.archived || task.parentId) return null;
  return nextOccurrenceDate(task.deadline ?? task.scheduledAt ?? today, task.repeat, today);
}

// "Skip this one" (decided with the user 2026-10-14): the occurrence isn't done, it moves to the
// rule's next date, and counts as used ("after N times" counts it down). Its deadline and
// scheduled day move together, its calendar entries follow (updateTaskLinked), and its sub-tasks
// move with it, reset to undone. Returns a function that puts everything back, for the toast's
// Undo; null when there's nothing to skip to.
export function skipOccurrence(taskId: TaskId, today = todayIso()): (() => void) | null {
  const tasks = useTaskStore.getState().tasks;
  const task = tasks[taskId];
  const next = skipTarget(taskId, today);
  if (!task || !task.repeat || !next) return null;
  const basis = task.deadline ?? task.scheduledAt ?? today;
  const delta = daysBetween(basis, next);
  const hasDate = !!(task.deadline || task.scheduledAt);
  const repeat: RepeatConfig = task.repeat.endKind === 'count'
    ? { ...task.repeat, count: Math.max(1, (task.repeat.count ?? 1) - 1) }
    : task.repeat;
  const before = { deadline: task.deadline, scheduledAt: task.scheduledAt, repeat: task.repeat };
  const subsBefore = (task.subtaskIds ?? []).map((id) => tasks[id]).filter((s): s is Task => !!s && !s.archived)
    .map((s) => ({ id: s.id, deadline: s.deadline, scheduledAt: s.scheduledAt, completed: s.completed }));
  updateTaskLinked(taskId, {
    deadline:    hasDate ? shift(task.deadline, delta) : next,
    scheduledAt: shift(task.scheduledAt, delta),
    repeat,
  });
  for (const s of subsBefore) {
    if (s.completed) useTaskStore.getState().toggleTask(s.id);
    updateTaskLinked(s.id, { deadline: shift(s.deadline, delta), scheduledAt: shift(s.scheduledAt, delta) });
  }
  return () => {
    updateTaskLinked(taskId, before);
    for (const s of subsBefore) {
      updateTaskLinked(s.id, { deadline: s.deadline, scheduledAt: s.scheduledAt });
      if (s.completed && !useTaskStore.getState().tasks[s.id]?.completed) useTaskStore.getState().toggleTask(s.id);
    }
  };
}

// Undo of a completion (the Completed toast): the occurrence it created goes, sub-tasks and
// calendar entries with it, without leaving anything in the Recycling Bin.
export function discardOccurrence(id: TaskId): void {
  for (const entry of trashedBy(() => deleteTaskWithCleanup(id))) deleteForever(entry);
}

// What a repeat rule reads as, for the task row and pane ("Every 2 weeks · 3 more").
export function repeatSummary(repeat: RepeatConfig): string {
  const L = LABELS.recurring;
  const [one, many] = L.units[repeat.freq];
  const every = L.summaryEvery(repeat.interval, repeat.interval === 1 ? one : many);
  if (repeat.endKind === 'count' && repeat.count) return `${every} · ${L.summaryMore(repeat.count - 1)}`;
  if (repeat.endKind === 'until' && repeat.until) return `${every} · ${L.summaryUntil(repeat.until)}`;
  return every;
}
