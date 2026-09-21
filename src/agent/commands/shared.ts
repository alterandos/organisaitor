import { z } from 'zod';
import { AgentError } from '@/agent/errors';
import { read } from '@/agent/access';
import type { CalendarEvent, CalendarReminder, Collection, RepeatConfig, ScheduleBlock, ScheduleTemplate, Task } from '@/types';

// ── Input primitives ─────────────────────────────────────────────────────────────────────────

export const idStr   = z.string().min(1).max(64);
export const dateStr = z.iso.date().describe('YYYY-MM-DD');
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM').describe('24-hour HH:MM');
export const daysOfWeek = z.array(z.number().int().min(0).max(6)).min(1).max(7).describe('0 = Sunday … 6 = Saturday');

export const repeatSchema = z.object({
  freq:     z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365).default(1).describe('Every N of freq'),
  endKind:  z.enum(['forever', 'count', 'until']).default('forever'),
  count:    z.number().int().min(1).max(1000).nullish().describe('Total occurrences, when endKind is "count"'),
  until:    dateStr.nullish().describe('Last date, when endKind is "until"'),
}).refine((r) => r.endKind !== 'count' || !!r.count, { message: 'count is required when endKind is "count"' })
  .refine((r) => r.endKind !== 'until' || !!r.until, { message: 'until is required when endKind is "until"' });

export function toRepeatConfig(r: z.output<typeof repeatSchema>): RepeatConfig {
  return {
    freq: r.freq,
    interval: r.interval,
    endKind: r.endKind,
    count: r.endKind === 'count' ? (r.count ?? null) : null,
    until: r.endKind === 'until' ? (r.until ?? null) : null,
  };
}

export const uniqueSorted = (nums: number[]): number[] => [...new Set(nums)].sort((a, b) => a - b);

// ── Lookups that fail in words the model can act on ──────────────────────────────────────────

const notFound = (what: string, id: string, hint: string) =>
  new AgentError('not_found', `No ${what} with id "${id}". ${hint}`);

export function requireTask(id: string): Task {
  const task = read.task(id);
  if (!task) throw notFound('task', id, 'Use list_tasks or search to find the right id.');
  return task;
}

export function requireActiveTask(id: string): Task {
  const task = requireTask(id);
  if (task.archived) throw new AgentError('conflict', `Task "${task.title}" is archived. Restore it with restore_item first.`);
  return task;
}

export function requireEndeavour(id: string): Collection {
  const c = read.endeavour(id);
  if (!c) throw notFound('Endeavour', id, 'Call get_context for the list of Endeavours.');
  if (c.archivedAt) throw new AgentError('conflict', `Endeavour "${c.name}" is archived and cannot be used for new items.`);
  return c;
}

export function requireCalendarItem(id: string) {
  const ref = read.calendarItem(id);
  if (!ref) throw notFound('calendar item', id, 'Use get_calendar_range or search to find the right id.');
  return ref;
}

export function requireSchedule(id: string): ScheduleTemplate {
  const s = read.schedule(id);
  if (!s) throw notFound('schedule', id, 'Use list_schedules to find the right id.');
  return s;
}

export function requireIds(kind: 'purpose' | 'tag', ids: string[]): void {
  const missing = ids.filter((id) => !(kind === 'purpose' ? read.purpose(id) : read.tag(id)));
  if (missing.length) throw new AgentError('not_found', `Unknown ${kind} id(s): ${missing.join(', ')}. Call get_context for the valid ones.`);
}

export function assertTimeOrder(start: string | null | undefined, end: string | null | undefined, hasEndDate: boolean): void {
  if (start && end && !hasEndDate && end <= start) {
    throw new AgentError('invalid', `End time ${end} is not after start time ${start}. Fix the times, or give an end date if it runs past midnight.`);
  }
}

export function assertBlockTimes(b: { title?: string; startTime: string; endTime: string }): void {
  if (b.endTime <= b.startTime) {
    throw new AgentError('invalid', `Block${b.title ? ` "${b.title}"` : ''}: end time ${b.endTime} must be after start time ${b.startTime} (blocks cannot run past midnight).`);
  }
}

// ── Summaries ────────────────────────────────────────────────────────────────────────────────
// Compact on purpose: what a read returns is sent to the model, so nulls and empty lists are dropped.

export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

const named = (c: { id: string; name: string } | undefined) => (c ? { id: c.id, name: c.name } : null);

export function repeatText(r: RepeatConfig | null) {
  if (!r) return null;
  return compact({
    every: `${r.interval} ${r.freq === 'daily' ? 'day' : r.freq === 'weekly' ? 'week' : r.freq === 'monthly' ? 'month' : 'year'}${r.interval === 1 ? '' : 's'}`,
    ends: r.endKind === 'forever' ? 'never' : r.endKind === 'count' ? `after ${r.count} times` : `on ${r.until}`,
    skippedDates: r.exceptions,
  });
}

export function taskSummary(t: Task) {
  return compact({
    id: t.id,
    title: t.title,
    status: t.archived ? 'archived' : t.completed ? 'done' : 'open',
    priority: t.priority === 'none' ? null : t.priority,
    kind: t.kind === 'action' ? null : t.kind,
    deadline: t.deadline,
    deadlineTime: t.deadlineTime,
    scheduledAt: t.scheduledAt,
    scheduledTime: t.scheduledTime,
    endeavour: t.collectionId ? named(read.endeavour(t.collectionId)) : null,
    parentId: t.parentId,
    subtasks: t.subtaskIds.length || null,
  });
}

export function taskDetail(t: Task) {
  return {
    ...taskSummary(t),
    ...compact({
      notes: t.notes,
      links: t.links,
      timeIntensity: t.timeIntensity,
      purposes: t.purposeIds.map((id) => named(read.purpose(id))).filter(Boolean),
      tags: t.tagIds.map((id) => named(read.tag(id))).filter(Boolean),
      completedAt: t.completedAt,
      archivedAt: t.archivedAt,
      archiveReason: t.archiveReason,
      calendarEventId: t.calendarEventId,
      subtaskList: t.subtaskIds.map((id) => read.task(id)).filter((s): s is Task => !!s).map(taskSummary),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }),
  };
}

export function eventSummary(e: CalendarEvent) {
  const linkedTask = e.eventType === 'task' ? read.tasks().find((t) => t.calendarEventId === e.id) : undefined;
  return compact({
    id: e.id,
    kind: 'event',
    title: e.title,
    date: e.date,
    endDate: e.endDate,
    startTime: e.startTime,
    endTime: e.endTime,
    location: e.location,
    type: e.eventType === 'default' ? null : e.eventType,
    tentative: e.status === 'tentative' ? true : null,
    important: e.important ? true : null,
    repeat: repeatText(e.repeat),
    endeavour: e.collectionId ? named(read.endeavour(e.collectionId)) : null,
    linkedTaskId: linkedTask?.id,
    archived: e.archivedAt ? true : null,
  });
}

export function eventDetail(e: CalendarEvent) {
  return {
    ...eventSummary(e),
    ...compact({
      notes: e.notes,
      links: e.links,
      notifyBefore: e.notifyBeforeValue === null ? null : `${e.notifyBeforeValue} ${e.notifyBeforeUnit}`,
      archiveReason: e.archiveReason,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }),
  };
}

export function reminderSummary(r: CalendarReminder) {
  const linkedTask = r.reminderType === 'task' ? read.tasks().find((t) => t.calendarReminderId === r.id) : undefined;
  return compact({
    id: r.id,
    kind: 'reminder',
    title: r.title,
    date: r.date,
    time: r.time,
    type: r.reminderType === 'default' ? null : r.reminderType,
    important: r.important ? true : null,
    repeat: repeatText(r.repeat),
    endeavour: r.collectionId ? named(read.endeavour(r.collectionId)) : null,
    linkedTaskId: linkedTask?.id,
    archived: r.archivedAt ? true : null,
  });
}

export function reminderDetail(r: CalendarReminder) {
  return {
    ...reminderSummary(r),
    ...compact({
      notes: r.notes,
      links: r.links,
      notifyDaysBefore: r.time ? null : r.notifyDaysBefore,
      notifyAtTime: r.time ? null : r.notifyAtTime,
      archiveReason: r.archiveReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }),
  };
}

export function blockSummary(b: ScheduleBlock) {
  return compact({
    id: b.id,
    title: b.title,
    days: b.daysOfWeek,
    startTime: b.startTime,
    endTime: b.endTime,
    location: b.location,
    everyNWeeks: b.interval > 1 ? b.interval : null,
    weekCountsFrom: b.interval > 1 || b.intervalAnchor ? b.intervalAnchor : null,
    skippedDates: b.exceptions,
    requiresCommitment: b.requiresCommitment ? true : null,
    committedDates: b.requiresCommitment ? b.committedDates : null,
    notes: b.notes,
  });
}

export function scheduleSummary(s: ScheduleTemplate) {
  return compact({
    id: s.id,
    name: s.name,
    active: s.active,
    startDate: s.startDate,
    endDate: s.endDate,
    endeavour: s.collectionId ? named(read.endeavour(s.collectionId)) : null,
    blocks: s.blocks.map(blockSummary),
  });
}

export function endeavourSummary(c: Collection) {
  return compact({
    id: c.id,
    name: c.name,
    kind: c.kind,
    description: c.description,
    deadline: c.deadline,
    archived: c.archivedAt ? true : null,
    openTasks: read.tasks().filter((t) => t.collectionId === c.id && !t.completed && !t.archived).length,
  });
}
