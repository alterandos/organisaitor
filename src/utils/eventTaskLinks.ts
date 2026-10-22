import { expandRepeat } from '@/utils/recurrence';
import { addDaysToIso } from '@/utils/date';
import type { CalendarDeadline, CalendarEvent, ItemLink, Task } from '@/types';

// Tasks linked to an event or a standalone Deadline (agreed with the user 2026-10-23), stored as
// the task's own ItemLinks (targetType 'event' | 'deadline'), so nothing new syncs:
//   - prepFor:    the task gets ready for it, so it's due when the event starts;
//   - followUpOf: the task comes after it, so it starts when the event ends;
//   - related:    anything else (work that runs through it); its dates are its own.
// A repeating event is linked as a whole series; the dates come from its next occurrence.
// When the event moves, a linked task whose date still matches the old one moves with it
// (services/eventTaskFollow.ts). The rules are here, pure, so the store watcher, the
// AddTaskModal, the pane and the Overview all read them the same way.

export type EventLinkKind = 'prepFor' | 'followUpOf' | 'related';
export type EventTargetType = 'event' | 'deadline';
export const EVENT_LINK_KINDS: EventLinkKind[] = ['prepFor', 'followUpOf', 'related'];

export const isEventLink = (l: ItemLink): boolean => l.targetType === 'event' || l.targetType === 'deadline';
export const eventLinksOf = (t: Task): ItemLink[] => (t.itemLinks ?? []).filter(isEventLink);

// The tasks linked to one event or Deadline, with how each relates.
export function tasksLinkedTo(targetType: EventTargetType, targetId: string, tasks: Record<string, Task>): { task: Task; kind: EventLinkKind }[] {
  const out: { task: Task; kind: EventLinkKind }[] = [];
  for (const t of Object.values(tasks)) {
    const l = eventLinksOf(t).find((x) => x.targetType === targetType && x.targetId === targetId);
    if (l) out.push({ task: t, kind: l.kind as EventLinkKind });
  }
  return out;
}

// When an event or Deadline is, for its linked tasks: its first day and time and its last day.
// A series uses its next occurrence on or after today (its first date if that's still ahead).
export interface Anchor { start: string; startTime: string | null; end: string }

export function anchorOf(type: EventTargetType, item: CalendarEvent | CalendarDeadline, today: string): Anchor {
  const e = type === 'event' ? item as CalendarEvent : null;
  const time = e ? e.startTime : (item as CalendarDeadline).time ?? null;
  const span = e?.endDate ? daysFrom(e.date, e.endDate) : 0;
  let start = item.date;
  if (item.repeat && item.date < today) start = expandRepeat(item.date, item.repeat, today, addDaysToIso(today, 730))[0] ?? item.date;
  return { start, startTime: time, end: addDaysToIso(start, span) };
}

// The dates a task gets from its link: preparation is due when the event starts, a follow-up
// starts when it ends. Related takes nothing.
export function datesForLink(kind: EventLinkKind, a: Anchor): Partial<Pick<Task, 'deadline' | 'deadlineTime' | 'scheduledAt'>> {
  if (kind === 'prepFor') return { deadline: a.start, deadlineTime: a.startTime };
  if (kind === 'followUpOf') return { scheduledAt: a.end };
  return {};
}

// The event moved from `before` to `after`: each open linked task whose date was set from it
// (still the same as the old date) moves with it. Returns each change with what it was, for Undo.
export interface FollowChange { taskId: string; patch: Partial<Task>; was: Partial<Task> }

export function followMove(tasks: Record<string, Task>, type: EventTargetType, id: string, before: Anchor, after: Anchor): FollowChange[] {
  const out: FollowChange[] = [];
  for (const { task, kind } of tasksLinkedTo(type, id, tasks)) {
    if (task.completed || task.archived) continue;
    if (kind === 'prepFor' && task.deadline === before.start && (before.start !== after.start || before.startTime !== after.startTime)) {
      const keepTime = task.deadlineTime !== before.startTime;
      out.push({
        taskId: task.id,
        patch: { deadline: after.start, deadlineTime: keepTime ? task.deadlineTime : after.startTime },
        was:   { deadline: task.deadline, deadlineTime: task.deadlineTime },
      });
    }
    if (kind === 'followUpOf' && task.scheduledAt === before.end && before.end !== after.end) {
      out.push({ taskId: task.id, patch: { scheduledAt: after.end }, was: { scheduledAt: task.scheduledAt } });
    }
  }
  return out;
}

function daysFrom(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
