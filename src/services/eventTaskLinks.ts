import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { updateTaskLinked } from '@/services/taskCalendarLinks';
import { isHydrating } from '@/services/sync/hydrating';
import { showToast } from '@/components/Toast/showToast';
import { anchorOf, datesForLink, followMove, isEventLink, type Anchor, type EventLinkKind, type EventTargetType } from '@/utils/eventTaskLinks';
import { makeItemLink } from '@/utils/taskLinks';
import { addDaysToIso, todayIso } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { CalendarDeadline, CalendarEvent, CalendarReminder, Task, TaskId } from '@/types';

// Tasks linked to events and Deadlines (rules: utils/eventTaskLinks.ts). Linking, changing how a
// task relates, unlinking, and the watcher that moves linked tasks when the event moves.

const L = LABELS.taskLinks.event;

type LinkTarget = CalendarEvent | CalendarReminder | CalendarDeadline;

export function eventTarget(type: EventTargetType, id: string): LinkTarget | undefined {
  const cal = useCalendarStore.getState();
  return type === 'event' ? cal.events[id as never] : type === 'reminder' ? cal.reminders[id as never] : cal.deadlines[id as never];
}

// The dates a new task linked this way starts with (AddTaskModal's prefill); for one date of a
// series (`occurrence`), that date's.
export function linkedTaskDates(kind: EventLinkKind, type: EventTargetType, id: string, occurrence: string | null = null): ReturnType<typeof datesForLink> {
  const item = eventTarget(type, id);
  if (!item) return {};
  const a = anchorOf(type, item, todayIso());
  return datesForLink(kind, occurrence ? { start: occurrence, startTime: a.startTime, end: addDaysToIso(occurrence, daysBetween(a.start, a.end)) } : a);
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// Link an existing task (or relink it another way). Preparation gets the event's start as its
// deadline and a follow-up its end as its start, unless it already has its own.
// For one date of a series (`occurrence`), the link names that date; a task can be linked to
// several dates of one series, a link each (2026-11-07). With no `occurrence`, relinking changes the
// link to the whole item, else the task's only link to it (keeping its date).
export function linkTaskToEvent(taskId: TaskId, kind: EventLinkKind, type: EventTargetType, id: string, occurrence: string | null = null): void {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task) return;
  const toThis = (task.itemLinks ?? []).filter((l) => isEventLink(l) && l.targetType === type && l.targetId === id);
  const was = occurrence ? toThis.find((l) => l.occurrence === occurrence)
    : toThis.find((l) => !l.occurrence) ?? (toThis.length === 1 ? toThis[0] : undefined);
  const others = (task.itemLinks ?? []).filter((l) => l !== was);
  const ts = new Date().toISOString();
  const date = occurrence ?? was?.occurrence ?? null;
  const link = { ...makeItemLink(kind, id, null, ts, type), ...(date ? { occurrence: date } : {}), ...(was?.ruleId ? { ruleId: was.ruleId } : {}) };
  useTaskStore.getState().updateTask(taskId, { itemLinks: [...others, link] });
  const dates = linkedTaskDates(kind, type, id, date);
  const patch: Partial<Task> = {};
  if (dates.deadline && !task.deadline) Object.assign(patch, { deadline: dates.deadline, deadlineTime: dates.deadlineTime ?? null });
  if (dates.scheduledAt && !task.scheduledAt) patch.scheduledAt = dates.scheduledAt;
  if (Object.keys(patch).length) updateTaskLinked(taskId, patch);
}

// Every link to the item, or with `occurrence` given, just that one (null: the link to the whole item).
export function unlinkTaskFromEvent(taskId: TaskId, type: EventTargetType, id: string, occurrence?: string | null): void {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task) return;
  const goes = (l: { targetType: string; targetId: string; occurrence?: string }) =>
    l.targetType === type && l.targetId === id && (occurrence === undefined || (l.occurrence ?? null) === occurrence);
  useTaskStore.getState().updateTask(taskId, { itemLinks: (task.itemLinks ?? []).filter((l) => !goes(l)) });
}

// Linked tasks follow their event (decided with the user 2026-10-23: automatically, with Undo).
// One watcher on the calendar store covers every way an event moves (its pane, a drag in the
// calendar or the Runway, a note's link, a notification's Postpone, an import, Undo). Not for
// changes sync brings from another device: that device moved the tasks already. A task's own
// calendar entries (eventType / deadlineType 'task') are left alone; they follow the task.
let following = false;

export function initEventTaskFollow(): () => void {
  return useCalendarStore.subscribe((state, prev) => {
    if (following || isHydrating()) return;
    const today = todayIso();
    const moved: { type: EventTargetType; id: string; title: string; before: Anchor; after: Anchor }[] = [];
    const scan = (type: EventTargetType, now: Record<string, LinkTarget>, was: Record<string, LinkTarget>) => {
      if (now === was) return;
      for (const [id, item] of Object.entries(now)) {
        const old = was[id];
        if (!old || old === item || isTaskShadow(item)) continue;
        const before = anchorOf(type, old, today);
        const after = anchorOf(type, item, today);
        if (before.start !== after.start || before.end !== after.end || before.startTime !== after.startTime) moved.push({ type, id, title: item.title, before, after });
      }
    };
    scan('event', state.events, prev.events);
    scan('reminder', state.reminders, prev.reminders);
    scan('deadline', state.deadlines, prev.deadlines);
    if (!moved.length) return;

    const tasks = useTaskStore.getState().tasks;
    const changes = moved.flatMap((m) => followMove(tasks, m.type, m.id, m.before, m.after));
    if (!changes.length) return;
    following = true;
    try {
      for (const c of changes) updateTaskLinked(c.taskId as TaskId, c.patch);
    } finally {
      following = false;
    }
    showToast({
      message: L.moved(changes.length, moved[0].title),
      actions: [{ label: L.undo, onClick: () => { for (const c of changes) updateTaskLinked(c.taskId as TaskId, c.was); } }],
    });
  });
}

const isTaskShadow = (item: LinkTarget): boolean =>
  ('eventType' in item && item.eventType === 'task') || ('deadlineType' in item && item.deadlineType === 'task')
  || ('reminderType' in item && item.reminderType === 'task');
