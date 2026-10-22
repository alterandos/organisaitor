import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { updateTaskLinked } from '@/services/taskCalendarLinks';
import { isHydrating } from '@/services/sync/hydrating';
import { showToast } from '@/components/Toast/showToast';
import { anchorOf, datesForLink, followMove, isEventLink, type Anchor, type EventLinkKind, type EventTargetType } from '@/utils/eventTaskLinks';
import { makeItemLink } from '@/utils/taskLinks';
import { todayIso } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { CalendarDeadline, CalendarEvent, Task, TaskId } from '@/types';

// Tasks linked to events and Deadlines (rules: utils/eventTaskLinks.ts). Linking, changing how a
// task relates, unlinking, and the watcher that moves linked tasks when the event moves.

const L = LABELS.taskLinks.event;

export function eventTarget(type: EventTargetType, id: string): CalendarEvent | CalendarDeadline | undefined {
  const cal = useCalendarStore.getState();
  return type === 'event' ? cal.events[id as never] : cal.deadlines[id as never];
}

// The dates a new task linked this way starts with (AddTaskModal's prefill).
export function linkedTaskDates(kind: EventLinkKind, type: EventTargetType, id: string): ReturnType<typeof datesForLink> {
  const item = eventTarget(type, id);
  return item ? datesForLink(kind, anchorOf(type, item, todayIso())) : {};
}

// Link an existing task (or relink it another way). Preparation gets the event's start as its
// deadline and a follow-up its end as its start, unless it already has its own.
export function linkTaskToEvent(taskId: TaskId, kind: EventLinkKind, type: EventTargetType, id: string): void {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task) return;
  const others = (task.itemLinks ?? []).filter((l) => !(isEventLink(l) && l.targetType === type && l.targetId === id));
  const ts = new Date().toISOString();
  useTaskStore.getState().updateTask(taskId, { itemLinks: [...others, makeItemLink(kind, id, null, ts, type)] });
  const dates = linkedTaskDates(kind, type, id);
  const patch: Partial<Task> = {};
  if (dates.deadline && !task.deadline) Object.assign(patch, { deadline: dates.deadline, deadlineTime: dates.deadlineTime ?? null });
  if (dates.scheduledAt && !task.scheduledAt) patch.scheduledAt = dates.scheduledAt;
  if (Object.keys(patch).length) updateTaskLinked(taskId, patch);
}

export function unlinkTaskFromEvent(taskId: TaskId, type: EventTargetType, id: string): void {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task) return;
  useTaskStore.getState().updateTask(taskId, { itemLinks: (task.itemLinks ?? []).filter((l) => !(l.targetType === type && l.targetId === id)) });
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
    const scan = (type: EventTargetType, now: Record<string, CalendarEvent | CalendarDeadline>, was: Record<string, CalendarEvent | CalendarDeadline>) => {
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

const isTaskShadow = (item: CalendarEvent | CalendarDeadline): boolean =>
  ('eventType' in item && item.eventType === 'task') || ('deadlineType' in item && item.deadlineType === 'task');
