import { z } from 'zod';
import { defineCommand } from '@/agent/types';
import { read, write } from '@/agent/access';
import { AgentError } from '@/agent/errors';
import { buildCalendarEventInput, buildCalendarReminderInput } from '@/utils/calendarItemInput';
import { mergeNewLinks } from '@/utils/links';
import type { CalendarEvent, CalendarReminder, NotifyUnit } from '@/types';
import {
  assertTimeOrder, dateStr, eventDetail, idStr, reminderDetail, repeatSchema, requireCalendarItem, requireEndeavour,
  timeStr, toRepeatConfig,
} from './shared';

const notifyBefore = z.object({
  value: z.number().int().min(1).max(999),
  unit: z.enum(['minutes', 'hours', 'days']),
}).describe('Notify this long before the event starts');

const eventFields = {
  endDate: dateStr.nullish().describe('Last day of a multi-day event'),
  startTime: timeStr.nullish(),
  endTime: timeStr.nullish(),
  location: z.string().trim().max(300).nullish(),
  tentative: z.boolean().optional().describe('A placeholder the user has not confirmed yet'),
  notifyBefore: notifyBefore.nullish(),
};

const reminderFields = {
  time: timeStr.nullish().describe('Leave out for an all-day reminder'),
  notifyDaysBefore: z.number().int().min(0).max(60).optional().describe('For an untimed reminder: how many days before to notify (0 = on the day)'),
  notifyAtTime: timeStr.optional().describe('For an untimed reminder: what time of day to notify'),
};

const CALENDAR_HELP =
  'kind "event" has a start/end (a meeting, a class); kind "reminder" is a single point in time or an all-day nudge. ' +
  'A birthday is an event with eventType "birthday" (no times; repeats every year).';

export const createCalendarItem = defineCommand({
  name: 'create_calendar_item',
  description:
    `Add an event or a reminder to the calendar. ${CALENDAR_HELP} Check get_calendar_range for the day first if timing matters, ` +
    'and search to avoid a duplicate. For work the user needs to do, create a task instead.',
  tier: 'create',
  approval: 'auto',
  input: z.object({
    kind: z.enum(['event', 'reminder']),
    title: z.string().trim().min(1).max(300),
    date: dateStr,
    notes: z.string().max(10_000).optional(),
    endeavourId: idStr.nullish(),
    repeat: repeatSchema.nullish(),
    important: z.boolean().optional(),
    eventType: z.enum(['default', 'birthday']).optional().describe('Events only'),
    links: z.array(z.url()).max(20).optional(),
    ...eventFields,
    ...reminderFields,
  }),
  run: (input, ctx) => {
    if (input.endeavourId) requireEndeavour(input.endeavourId);
    const repeat = input.repeat ? toRepeatConfig(input.repeat) : null;

    if (input.kind === 'reminder') {
      const stray = (['endDate', 'startTime', 'endTime', 'location', 'tentative', 'notifyBefore', 'eventType'] as const).filter((k) => input[k] != null);
      if (stray.length) throw new AgentError('invalid', `A reminder has no ${stray.join(', ')}. Use kind "event" for those, or "time" for a reminder's time.`);
      const id = write.createReminder(buildCalendarReminderInput({
        title: input.title, date: input.date, time: input.time, notes: input.notes, links: input.links,
        collectionId: (input.endeavourId ?? null) as never, repeat, important: input.important,
        notifyDaysBefore: input.notifyDaysBefore, notifyAtTime: input.notifyAtTime,
      }));
      ctx.seen('reminder', id);
      return { created: reminderDetail(read.reminder(id) as CalendarReminder) };
    }

    if (input.time != null) throw new AgentError('invalid', 'An event uses startTime/endTime, not "time".');
    const birthday = input.eventType === 'birthday';
    if (birthday && (input.startTime || input.endTime)) throw new AgentError('invalid', 'A birthday has no times.');
    assertTimeOrder(input.startTime, input.endTime, !!input.endDate && input.endDate > input.date);
    if (input.endDate && input.endDate < input.date) throw new AgentError('invalid', 'endDate is before date.');

    const id = write.createEvent(buildCalendarEventInput({
      title: input.title, date: input.date, endDate: input.endDate, startTime: input.startTime, endTime: input.endTime,
      notes: input.notes, links: input.links, location: input.location, eventType: input.eventType,
      collectionId: (input.endeavourId ?? null) as never,
      notifyBeforeValue: input.notifyBefore?.value ?? null, notifyBeforeUnit: input.notifyBefore?.unit as NotifyUnit | undefined,
      repeat, status: input.tentative ? 'tentative' : 'confirmed', important: input.important,
    }));
    ctx.seen('event', id);
    return { created: eventDetail(read.event(id) as CalendarEvent) };
  },
});

export const updateCalendarItem = defineCommand({
  name: 'update_calendar_item',
  description:
    'Change fields of an existing event or reminder (find its id with get_calendar_range or search). Only the fields you pass change; ' +
    'null clears a nullable field. This changes the whole series if it repeats — use edit_occurrence for a single date. ' +
    'Items that belong to a task (a task deadline reminder, or the event for a scheduled task) follow the task: change those through update_task.',
  tier: 'modify',
  approval: 'auto',
  input: z.object({
    id: idStr,
    title: z.string().trim().min(1).max(300).optional(),
    date: dateStr.optional(),
    notes: z.string().max(10_000).nullish(),
    endeavourId: idStr.nullish(),
    repeat: repeatSchema.nullish().describe('null makes it non-repeating'),
    important: z.boolean().optional(),
    ...eventFields,
    ...reminderFields,
  }),
  run: (input, ctx) => {
    const ref = requireCalendarItem(input.id);
    if (ref.item.archivedAt) throw new AgentError('conflict', 'That item is archived. Restore it with restore_item first.');
    if (input.endeavourId) requireEndeavour(input.endeavourId);
    const repeat = input.repeat === undefined ? undefined : input.repeat === null ? null : toRepeatConfig(input.repeat);

    if (ref.kind === 'reminder') {
      const r = ref.item;
      if (r.reminderType === 'task') throw new AgentError('refused', 'This reminder is a task deadline. Change the task\'s deadline with update_task.');
      const stray = (['endDate', 'startTime', 'endTime', 'location', 'tentative', 'notifyBefore'] as const).filter((k) => input[k] != null);
      if (stray.length) throw new AgentError('invalid', `A reminder has no ${stray.join(', ')}.`);
      const changes: Partial<Omit<CalendarReminder, 'id' | 'createdAt'>> = {};
      if (input.title !== undefined) changes.title = input.title;
      if (input.date !== undefined) changes.date = input.date;
      if (input.notes !== undefined) { changes.notes = input.notes || null; changes.links = mergeNewLinks(r.links, input.notes, r.notes); }
      if (input.endeavourId !== undefined) changes.collectionId = input.endeavourId as never;
      if (repeat !== undefined) changes.repeat = repeat;
      if (input.important !== undefined) changes.important = input.important;
      if (input.time !== undefined) changes.time = input.time;
      if (input.notifyDaysBefore !== undefined) changes.notifyDaysBefore = input.notifyDaysBefore;
      if (input.notifyAtTime !== undefined) changes.notifyAtTime = input.notifyAtTime;
      if (Object.keys(changes).length === 0) throw new AgentError('invalid', 'Nothing to change: pass at least one field besides id.');
      write.updateReminder(r.id, changes);
      ctx.seen('reminder', r.id);
      return { updated: reminderDetail(read.reminder(r.id) as CalendarReminder) };
    }

    const e = ref.item;
    const linkedToTask = e.eventType === 'task';
    if (linkedToTask && repeat !== undefined) throw new AgentError('refused', 'This event belongs to a scheduled task, which does not repeat.');
    if (e.eventType === 'birthday' && (input.startTime || input.endTime)) throw new AgentError('invalid', 'A birthday has no times.');
    if (input.time != null) throw new AgentError('invalid', 'An event uses startTime/endTime, not "time".');

    const date = input.date ?? e.date;
    const endDate = input.endDate === undefined ? e.endDate : input.endDate;
    const startTime = input.startTime === undefined ? e.startTime : input.startTime;
    const endTime = input.endTime === undefined ? e.endTime : input.endTime;
    if (endDate && endDate < date) throw new AgentError('invalid', 'endDate is before date.');
    assertTimeOrder(startTime, endTime, !!endDate && endDate > date);

    const changes: Partial<Omit<CalendarEvent, 'id' | 'createdAt'>> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.date !== undefined) changes.date = input.date;
    if (input.endDate !== undefined || input.date !== undefined) changes.endDate = endDate && endDate > date ? endDate : null;
    if (input.startTime !== undefined) changes.startTime = input.startTime;
    if (input.endTime !== undefined) changes.endTime = input.endTime;
    if (input.notes !== undefined) { changes.notes = input.notes || null; changes.links = mergeNewLinks(e.links, input.notes, e.notes); }
    if (input.location !== undefined) changes.location = input.location || null;
    if (input.endeavourId !== undefined) changes.collectionId = input.endeavourId as never;
    if (repeat !== undefined) changes.repeat = repeat;
    if (input.important !== undefined) changes.important = input.important;
    if (input.tentative !== undefined) changes.status = input.tentative ? 'tentative' : 'confirmed';
    if (input.notifyBefore !== undefined) {
      changes.notifyBeforeValue = input.notifyBefore ? input.notifyBefore.value : null;
      if (input.notifyBefore) changes.notifyBeforeUnit = input.notifyBefore.unit;
    }
    if (Object.keys(changes).length === 0) throw new AgentError('invalid', 'Nothing to change: pass at least one field besides id.');
    write.updateEvent(e.id, changes);
    ctx.seen('event', e.id);
    return { updated: eventDetail(read.event(e.id) as CalendarEvent) };
  },
});

export const editOccurrence = defineCommand({
  name: 'edit_occurrence',
  description:
    'Change one date of a repeating event or reminder without touching the rest. "skip" removes just that date. ' +
    '"detach" pulls that date out into its own standalone item (which you can then edit). "split" ends the current series the day before and ' +
    'starts a new series from that date (so later dates can differ). "end_series_before" stops the series the day before that date. ' +
    'Ending a series before its first date would delete it, so that is refused: archive the item instead.',
  tier: 'modify',
  approval: 'auto',
  input: z.object({
    id: idStr,
    date: dateStr.describe('The occurrence date to act on'),
    action: z.enum(['skip', 'detach', 'split', 'end_series_before']),
  }),
  run: (input, ctx) => {
    const ref = requireCalendarItem(input.id);
    if (!ref.item.repeat) throw new AgentError('invalid', 'That item does not repeat, so there is no occurrence to edit.');
    if (ref.kind === 'event' ? ref.item.eventType === 'task' : ref.item.reminderType === 'task') {
      throw new AgentError('refused', 'This item belongs to a task, which does not repeat.');
    }
    if (input.date < ref.item.date) throw new AgentError('invalid', `The series starts on ${ref.item.date}; ${input.date} is before that.`);
    ctx.seen(ref.kind, ref.item.id);

    if (input.action === 'skip') {
      write.skipOccurrence(ref.kind, ref.item.id, input.date);
      return { skipped: input.date };
    }
    if (input.action === 'end_series_before') {
      write.endSeriesBefore(ref.kind, ref.item.id, input.date);
      return { seriesEndsOn: input.date };
    }
    const newId = input.action === 'detach'
      ? write.detachOccurrence(ref.kind, ref.item.id, input.date)
      : write.splitSeries(ref.kind, ref.item.id, input.date);
    if (!newId) throw new AgentError('invalid', input.action === 'split' ? 'Cannot split at the first date of the series: update the series itself.' : 'Nothing was detached.');
    ctx.seen(ref.kind, newId);
    return { newItemId: newId };
  },
});

export const CALENDAR_COMMANDS = [createCalendarItem, updateCalendarItem, editOccurrence];
