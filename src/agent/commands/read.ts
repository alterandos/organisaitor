import { z } from 'zod';
import { defineCommand } from '@/agent/types';
import { read } from '@/agent/access';
import { AgentError } from '@/agent/errors';
import { addDaysToIso } from '@/utils/date';
import { expandRepeat, isOccurrenceSkipped } from '@/utils/recurrence';
import { expandScheduleBlock, blocksMayConflict } from '@/utils/scheduleOccurrences';
import { createScheduleBlock } from '@/utils/scheduleBlocks';
import {
  assertBlockTimes, compact, dateStr, daysOfWeek, endeavourSummary, eventDetail, eventSummary, idStr,
  reminderDetail, reminderSummary, requireCalendarItem, requireEndeavour, requireSchedule, requireTask,
  scheduleSummary, taskDetail, taskSummary, timeStr, uniqueSorted, blockSummary,
} from './shared';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000);

// ── get_context ──────────────────────────────────────────────────────────────────────────────

export const getContext = defineCommand({
  name: 'get_context',
  description:
    "Call this first. Returns today's date and weekday, the account's timezone, and the ids and names of the user's " +
    'Endeavours, Purposes and Tags — which you need to file anything under them — plus a short glossary of how the app works.',
  tier: 'read',
  approval: 'auto',
  input: z.object({}),
  run: () => ({
    today: read.today(),
    weekday: weekday(read.today()),
    timezone: read.timezone(),
    endeavours: read.endeavours().filter((c) => !c.archivedAt).map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    purposes: read.purposes().filter((p) => !p.archivedAt).map((p) => ({ id: p.id, name: p.name })),
    tags: read.tags().map((t) => ({ id: t.id, name: t.name })),
    glossary: [
      'An Endeavour is a project or list that tasks and calendar items can be filed under.',
      "A task's deadline is when it is due; scheduled is the day the user plans to work on it. Both appear on the calendar.",
      'A Schedule is a recurring weekly timetable layer (classes, gym sessions) that can be switched on and off. A Routine is a daily habit checklist in Records — a different thing.',
      'Dates are YYYY-MM-DD and times are 24-hour HH:MM, in the account timezone.',
      'You cannot delete anything. Archive instead: archived items are hidden but the user can restore them.',
      'Everything you change can be undone by the user as one batch.',
    ],
  }),
});

// ── search ───────────────────────────────────────────────────────────────────────────────────

const SEARCH_TYPES = ['task', 'calendar_item', 'schedule', 'endeavour'] as const;

export const search = defineCommand({
  name: 'search',
  description:
    'Keyword search across tasks, calendar items, schedules and Endeavours. Every word must appear (in the title, notes, ' +
    'location or block titles). Use it to find an existing item before creating a duplicate.',
  tier: 'read',
  approval: 'auto',
  input: z.object({
    query: z.string().trim().min(1).max(200),
    types: z.array(z.enum(SEARCH_TYPES)).optional().describe('Limit to these kinds; default all'),
    includeArchived: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  run: (input, ctx) => {
    const words = input.query.toLowerCase().split(/\s+/).filter(Boolean);
    const wanted = new Set<string>(input.types ?? SEARCH_TYPES);
    const hits: { rank: number; hit: Record<string, unknown> }[] = [];

    const consider = (title: string, rest: (string | null | undefined)[], make: () => Record<string, unknown>, archived: boolean) => {
      if (archived && !input.includeArchived) return;
      const t = title.toLowerCase();
      const haystack = `${t} ${rest.filter(Boolean).join(' ').toLowerCase()}`;
      if (!words.every((w) => haystack.includes(w))) return;
      hits.push({ rank: words.every((w) => t.includes(w)) ? 0 : 1, hit: make() });
    };

    if (wanted.has('task')) {
      for (const t of read.tasks()) consider(t.title, [t.notes], () => ({ type: 'task', ...taskSummary(t) }), t.archived);
    }
    if (wanted.has('calendar_item')) {
      for (const e of read.events()) consider(e.title, [e.notes, e.location], () => eventSummary(e), !!e.archivedAt);
      for (const r of read.reminders()) {
        if (r.reminderType === 'task') continue;
        consider(r.title, [r.notes], () => reminderSummary(r), !!r.archivedAt);
      }
    }
    if (wanted.has('schedule')) {
      for (const s of read.schedules()) {
        consider(s.name, s.blocks.flatMap((b) => [b.title, b.location]), () => ({ type: 'schedule', id: s.id, name: s.name, active: s.active, blocks: s.blocks.length }), false);
      }
    }
    if (wanted.has('endeavour')) {
      for (const c of read.endeavours()) consider(c.name, [c.description], () => ({ type: 'endeavour', ...endeavourSummary(c) }), !!c.archivedAt);
    }

    hits.sort((a, b) => a.rank - b.rank);
    const results = hits.slice(0, input.limit).map((h) => h.hit);
    for (const r of results) {
      const id = String(r.id);
      const kind = r.type === 'task' ? 'task' : r.type === 'schedule' ? 'schedule' : r.type === 'endeavour' ? 'endeavour' : r.kind === 'reminder' ? 'reminder' : 'event';
      ctx.seen(kind, id);
    }
    return { total: hits.length, results };
  },
});

// ── list_tasks ───────────────────────────────────────────────────────────────────────────────

export const listTasks = defineCommand({
  name: 'list_tasks',
  description: 'List tasks, newest first by due date. Defaults to open (not done, not archived) top-level tasks. Sub-tasks are counted on their parent; pass parentId to list them.',
  tier: 'read',
  approval: 'auto',
  input: z.object({
    status: z.enum(['open', 'done', 'archived', 'all']).default('open'),
    endeavourId: idStr.optional(),
    parentId: idStr.optional().describe('List the sub-tasks of this task'),
    dueFrom: dateStr.optional().describe('Deadline on or after'),
    dueTo: dateStr.optional().describe('Deadline on or before'),
    scheduledFrom: dateStr.optional(),
    scheduledTo: dateStr.optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    text: z.string().trim().max(200).optional().describe('Words that must appear in the title or notes'),
    limit: z.number().int().min(1).max(100).default(30),
    offset: z.number().int().min(0).default(0),
  }),
  run: (input, ctx) => {
    if (input.endeavourId) requireEndeavour(input.endeavourId);
    const words = (input.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const matches = read.tasks().filter((t) => {
      if (input.parentId ? t.parentId !== input.parentId : t.parentId !== null) return false;
      const status = t.archived ? 'archived' : t.completed ? 'done' : 'open';
      if (input.status !== 'all' && status !== input.status) return false;
      if (input.endeavourId && t.collectionId !== input.endeavourId) return false;
      if (input.priority && t.priority !== input.priority) return false;
      if (input.dueFrom && (!t.deadline || t.deadline < input.dueFrom)) return false;
      if (input.dueTo && (!t.deadline || t.deadline > input.dueTo)) return false;
      if (input.scheduledFrom && (!t.scheduledAt || t.scheduledAt < input.scheduledFrom)) return false;
      if (input.scheduledTo && (!t.scheduledAt || t.scheduledAt > input.scheduledTo)) return false;
      if (words.length) {
        const hay = `${t.title} ${t.notes ?? ''}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    matches.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.sortOrder - b.sortOrder);
    const page = matches.slice(input.offset, input.offset + input.limit);
    page.forEach((t) => ctx.seen('task', t.id));
    return { total: matches.length, offset: input.offset, tasks: page.map(taskSummary) };
  },
});

// ── list_schedules ───────────────────────────────────────────────────────────────────────────

export const listSchedules = defineCommand({
  name: 'list_schedules',
  description:
    'List the recurring weekly Schedules with their blocks, whether each is switched on, and its date range. Call this before ' +
    'creating a schedule so you can update an existing one (for example a new semester of the same course) instead of duplicating it.',
  tier: 'read',
  approval: 'auto',
  input: z.object({ includeInactive: z.boolean().default(true) }),
  run: (input, ctx) => {
    const list = read.schedules().filter((s) => input.includeInactive || s.active);
    list.forEach((s) => ctx.seen('schedule', s.id));
    return { schedules: list.map(scheduleSummary) };
  },
});

// ── get ──────────────────────────────────────────────────────────────────────────────────────

export const get = defineCommand({
  name: 'get',
  description: 'Full detail for one item by id: notes, links, sub-tasks, linked calendar entries, blocks and so on.',
  tier: 'read',
  approval: 'auto',
  input: z.object({ type: z.enum(['task', 'calendar_item', 'schedule', 'endeavour']), id: idStr }),
  run: (input, ctx) => {
    if (input.type === 'task') {
      const task = requireTask(input.id);
      ctx.seen('task', task.id);
      return taskDetail(task);
    }
    if (input.type === 'calendar_item') {
      const ref = requireCalendarItem(input.id);
      ctx.seen(ref.kind, ref.item.id);
      return ref.kind === 'event' ? eventDetail(ref.item) : reminderDetail(ref.item);
    }
    if (input.type === 'schedule') {
      const schedule = requireSchedule(input.id);
      ctx.seen('schedule', schedule.id);
      return scheduleSummary(schedule);
    }
    const c = read.endeavour(input.id);
    if (!c) throw new AgentError('not_found', `No Endeavour with id "${input.id}". Call get_context for the list.`);
    ctx.seen('endeavour', c.id);
    return endeavourSummary(c);
  },
});

// ── get_calendar_range ───────────────────────────────────────────────────────────────────────

const MAX_RANGE_DAYS = 92;

interface CalendarRow {
  date: string;
  sortTime: string;
  item: Record<string, unknown>;
}

export const getCalendarRange = defineCommand({
  name: 'get_calendar_range',
  description:
    'Everything on the calendar between two dates (at most 92 days), expanded: repeating events and reminders as individual ' +
    'occurrences, task deadlines, tasks scheduled onto a day, and blocks of switched-on Schedules. Use it to see what a day or ' +
    'week looks like before adding something, or to find a free slot.',
  tier: 'read',
  approval: 'auto',
  input: z.object({
    from: dateStr,
    to: dateStr,
    endeavourId: idStr.optional().describe('Only items filed under this Endeavour'),
    limit: z.number().int().min(1).max(400).default(200),
  }).refine((v) => v.to >= v.from, { message: '"to" must not be before "from"' }),
  run: (input, ctx) => {
    if (daysBetween(input.from, input.to) > MAX_RANGE_DAYS) {
      throw new AgentError('invalid', `Range is too long: ask for at most ${MAX_RANGE_DAYS} days at a time.`);
    }
    if (input.endeavourId) requireEndeavour(input.endeavourId);
    const inScope = (collectionId: string | null) => !input.endeavourId || collectionId === input.endeavourId;
    const rows: CalendarRow[] = [];

    for (const e of read.events()) {
      if (e.archivedAt || !inScope(e.collectionId)) continue;
      const span = e.endDate && e.endDate > e.date ? daysBetween(e.date, e.endDate) : 0;
      const starts = [e.date, ...(e.repeat ? expandRepeat(e.date, e.repeat, addDaysToIso(input.from, -span), input.to) : [])]
        .filter((d) => !(d === e.date && isOccurrenceSkipped(e.repeat, d)));
      for (const start of starts) {
        if (start > input.to || addDaysToIso(start, span) < input.from) continue;
        ctx.seen('event', e.id);
        rows.push({ date: start, sortTime: e.startTime ?? '', item: { ...eventSummary(e), date: start, endDate: span ? addDaysToIso(start, span) : null, occurrenceOf: e.repeat ? e.id : null, kind: e.eventType === 'task' ? 'task_scheduled' : 'event' } });
      }
    }

    for (const r of read.reminders()) {
      if (r.archivedAt || r.reminderType === 'task' || !inScope(r.collectionId)) continue;
      const dates = [r.date, ...(r.repeat ? expandRepeat(r.date, r.repeat, input.from, input.to) : [])]
        .filter((d) => !(d === r.date && isOccurrenceSkipped(r.repeat, d)));
      for (const d of dates) {
        if (d < input.from || d > input.to) continue;
        ctx.seen('reminder', r.id);
        rows.push({ date: d, sortTime: r.time ?? '', item: { ...reminderSummary(r), date: d } });
      }
    }

    for (const t of read.tasks()) {
      if (t.archived || !t.deadline || t.deadline < input.from || t.deadline > input.to || !inScope(t.collectionId)) continue;
      ctx.seen('task', t.id);
      rows.push({ date: t.deadline, sortTime: t.deadlineTime ?? '', item: compact({ kind: 'task_deadline', taskId: t.id, title: t.title, date: t.deadline, time: t.deadlineTime, done: t.completed ? true : null }) });
    }

    for (const s of read.schedules()) {
      if (!s.active || !inScope(s.collectionId)) continue;
      for (const b of s.blocks) {
        for (const d of expandScheduleBlock(b, s, input.from, input.to)) {
          ctx.seen('schedule', s.id);
          rows.push({ date: d, sortTime: b.startTime, item: compact({
            kind: 'schedule_block', scheduleId: s.id, scheduleName: s.name, blockId: b.id, title: b.title, date: d,
            startTime: b.startTime, endTime: b.endTime, location: b.location,
            committed: b.requiresCommitment ? b.committedDates.includes(d) : null,
          }) });
        }
      }
    }

    rows.sort((a, b) => a.date.localeCompare(b.date) || a.sortTime.localeCompare(b.sortTime));
    return { from: input.from, to: input.to, total: rows.length, truncated: rows.length > input.limit, items: rows.slice(0, input.limit).map((r) => r.item) };
  },
});

// ── find_schedule_conflicts / preview_schedule ───────────────────────────────────────────────

const candidateBlock = z.object({
  title: z.string().trim().max(200).optional(),
  daysOfWeek,
  startTime: timeStr,
  endTime: timeStr,
});

export const findScheduleConflicts = defineCommand({
  name: 'find_schedule_conflicts',
  description:
    'Given proposed weekly blocks, report which blocks of the switched-on Schedules they would overlap (same weekday and ' +
    'overlapping times). Conservative: it ignores every-other-week patterns, so treat a hit as "worth checking". Use it before adding a schedule.',
  tier: 'read',
  approval: 'auto',
  input: z.object({
    blocks: z.array(candidateBlock).min(1).max(50),
    excludeScheduleId: idStr.optional().describe('Ignore this schedule (when updating it)'),
  }),
  run: (input, ctx) => {
    const anchor = read.today();
    const active = read.schedules().filter((s) => s.active && s.id !== input.excludeScheduleId);
    const conflicts = input.blocks.flatMap((cand, index) => {
      assertBlockTimes(cand);
      const proposed = createScheduleBlock({ title: cand.title ?? 'proposed', daysOfWeek: cand.daysOfWeek, startTime: cand.startTime, endTime: cand.endTime, intervalAnchor: anchor });
      return active.flatMap((s) => s.blocks.filter((b) => blocksMayConflict(proposed, b)).map((b) => {
        ctx.seen('schedule', s.id);
        return { proposedBlock: index, proposedTitle: cand.title ?? null, schedule: { id: s.id, name: s.name }, block: blockSummary(b) };
      }));
    });
    return { conflictCount: conflicts.length, conflicts };
  },
});

const PREVIEW_DATES_PER_BLOCK = 40;

export const previewSchedule = defineCommand({
  name: 'preview_schedule',
  description:
    'Show the concrete dates a schedule (an existing one by id, or proposed blocks) would land on within a date range — ' +
    'honouring every-N-weeks patterns, the schedule start/end dates and skipped dates. Default range is the next four weeks.',
  tier: 'read',
  approval: 'auto',
  input: z.object({
    scheduleId: idStr.optional(),
    blocks: z.array(candidateBlock.extend({
      interval: z.number().int().min(1).max(52).default(1),
      intervalAnchor: dateStr.optional(),
    })).min(1).max(50).optional().describe('Proposed blocks, instead of scheduleId'),
    startDate: dateStr.optional().describe('Proposed schedule start (with blocks)'),
    endDate: dateStr.optional().describe('Proposed schedule end (with blocks)'),
    from: dateStr.optional(),
    to: dateStr.optional(),
  }).refine((v) => !!v.scheduleId !== !!v.blocks, { message: 'Give either scheduleId or blocks, not both' }),
  run: (input, ctx) => {
    const today = read.today();
    const existing = input.scheduleId ? requireSchedule(input.scheduleId) : null;
    const bounds = existing ?? { startDate: input.startDate ?? null, endDate: input.endDate ?? null };
    const from = input.from ?? (bounds.startDate && bounds.startDate > today ? bounds.startDate : today);
    const to = input.to ?? addDaysToIso(from, 27);
    if (to < from) throw new AgentError('invalid', '"to" must not be before "from".');
    if (daysBetween(from, to) > 366) throw new AgentError('invalid', 'Range is too long: at most a year.');
    if (existing) ctx.seen('schedule', existing.id);

    const blocks = existing
      ? existing.blocks
      : (input.blocks ?? []).map((b) => {
          assertBlockTimes(b);
          return createScheduleBlock({ title: b.title ?? 'proposed', daysOfWeek: uniqueSorted(b.daysOfWeek), startTime: b.startTime, endTime: b.endTime, interval: b.interval, intervalAnchor: b.intervalAnchor ?? bounds.startDate ?? today });
        });

    return {
      from, to,
      blocks: blocks.map((b) => {
        const dates = expandScheduleBlock(b, bounds, from, to);
        return { title: b.title, startTime: b.startTime, endTime: b.endTime, count: dates.length, dates: dates.slice(0, PREVIEW_DATES_PER_BLOCK), truncated: dates.length > PREVIEW_DATES_PER_BLOCK };
      }),
    };
  },
});

export const READ_COMMANDS = [getContext, search, listTasks, listSchedules, get, getCalendarRange, findScheduleConflicts, previewSchedule];
