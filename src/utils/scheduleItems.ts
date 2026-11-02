import type { CalendarEvent, Collection, CreateCalendarEventInput, RepeatConfig, ScheduleBlock, ScheduleId, ScheduleTemplate } from '@/types';
import { expandScheduleBlock } from '@/utils/scheduleOccurrences';
import { breakDates, effectivePeriod } from '@/utils/endeavourPeriod';
import { addDaysToIso } from '@/utils/date';

// A Schedule's items (docs/features/endeavours.md phase 7 (c)), pure: a Schedule is a named set
// of repeating calendar events (`CalendarEvent.scheduleId`), bounded by its period and with its
// breaks skipped. A `ScheduleBlock` is now only the shape a row is written in (the Schedule editor,
// templates, the agent) before it becomes an event, and the shape a Schedule kept before phase 7.

// How long before a confirmed occurrence of a commitment-mode item it notifies.
export const COMMITTED_NOTIFY_MINUTES = 30;

export interface ScheduleBounds { start: string | null; end: string | null; breaks: string[] }

// Its own dates and breaks, else its Endeavour's period (live, from above if it has none).
export function scheduleBounds(schedule: ScheduleTemplate, collections: Record<string, Collection>): ScheduleBounds {
  const inherited = schedule.collectionId ? effectivePeriod(schedule.collectionId, collections)?.period ?? null : null;
  return {
    start:  schedule.startDate ?? inherited?.start ?? null,
    end:    schedule.endDate ?? inherited?.end ?? null,
    breaks: schedule.breaks ? breakDates({ start: null, end: null, breaks: schedule.breaks }) : breakDates(inherited),
  };
}

// The repeat with the bounds applied: ends at the end, and skips the break days. The person's own
// skips are kept apart from the breaks' (`breakSkips`), so a break moved or removed changes only
// its own.
export function boundedRepeat(repeat: RepeatConfig, bounds: ScheduleBounds): RepeatConfig {
  const before = new Set(repeat.breakSkips ?? []);
  const own = (repeat.exceptions ?? []).filter((d) => !before.has(d));
  const ownSet = new Set(own);
  const skips = bounds.breaks.filter((d) => !ownSet.has(d));
  const next: RepeatConfig = { ...repeat, exceptions: [...own, ...skips].sort() };
  if (skips.length) next.breakSkips = skips; else delete next.breakSkips;
  if (bounds.end) { next.endKind = 'until'; next.until = bounds.end; next.count = null; }
  return next;
}

export const sameRepeat = (a: RepeatConfig | null, b: RepeatConfig | null) => JSON.stringify(a) === JSON.stringify(b);

// One row as a calendar event: the first occurrence on or after the start, repeating weekly on its
// days. Null when it has no occurrence (no days, or none before the end).
export function blockToItem(schedule: ScheduleTemplate, block: ScheduleBlock, bounds: ScheduleBounds): CreateCalendarEventInput | null {
  if (!block.daysOfWeek.length) return null;
  const lo = bounds.start && bounds.start > block.intervalAnchor ? bounds.start : block.intervalAnchor;
  const interval = Math.max(1, block.interval || 1);
  const first = expandScheduleBlock({ ...block, exceptions: [] }, { startDate: bounds.start, endDate: bounds.end }, lo, addDaysToIso(lo, 7 * (interval + 1)))[0];
  if (!first) return null;
  const repeat = boundedRepeat({
    freq: 'weekly', interval, endKind: 'forever', count: null, until: null,
    daysOfWeek: [...block.daysOfWeek].sort((a, b) => a - b),
    exceptions: block.exceptions.filter((d) => d >= first),
  }, bounds);
  return {
    title: block.title, date: first, startTime: block.startTime, endTime: block.endTime,
    location: block.location, notes: block.notes, collectionId: schedule.collectionId,
    status: block.requiresCommitment ? 'tentative' : 'confirmed',
    repeat, scheduleId: schedule.id,
  };
}

// A Schedule's items, the series themselves (not dates taken out of them), by weekday and time.
export function scheduleItems(scheduleId: string, events: Record<string, CalendarEvent>): CalendarEvent[] {
  return Object.values(events)
    .filter((e) => e.scheduleId === scheduleId && !e.seriesId && !e.archivedAt)
    .sort((a, b) => weekday(a) - weekday(b) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title));
}

const weekday = (e: CalendarEvent) => (e.repeat?.daysOfWeek?.[0] ?? new Date(e.date + 'T00:00:00').getDay());

// An item read back as a row (the Schedule editor, the agent's summaries and conflict checks).
// An item changed in the calendar to something that isn't weekly still reads as its date's weekday.
export function itemToBlock(e: CalendarEvent): ScheduleBlock {
  const weekly = e.repeat?.freq === 'weekly';
  return {
    id: e.id,
    title: e.title,
    daysOfWeek: weekly && e.repeat?.daysOfWeek?.length ? [...e.repeat.daysOfWeek] : [new Date(e.date + 'T00:00:00').getDay()],
    startTime: e.startTime ?? '09:00',
    endTime: e.endTime ?? e.startTime ?? '10:00',
    location: e.location,
    interval: weekly ? e.repeat!.interval : 1,
    intervalAnchor: e.date,
    exceptions: (e.repeat?.exceptions ?? []).filter((d) => !(e.repeat?.breakSkips ?? []).includes(d)),
    notes: e.notes,
    requiresCommitment: e.status === 'tentative',
    committedDates: [],
  };
}

// Hidden from the calendar while its Schedule is switched off.
export function hiddenBySchedule(e: Pick<CalendarEvent, 'scheduleId'>, schedules: Record<string, ScheduleTemplate>): boolean {
  return !!e.scheduleId && schedules[e.scheduleId as ScheduleId]?.active === false;
}

// A Schedule seen with its items as rows (`blocks`), for the readers written for rows: the
// Schedules list, its conflict count and previews, the agent's summaries.
export function withItemRows(schedule: ScheduleTemplate, events: Record<string, CalendarEvent>): ScheduleTemplate {
  // Dates taken out of an item ("only this one") aren't its skips; the confirmed ones of a
  // commitment-mode item are its committed dates.
  const taken = new Map<string, CalendarEvent[]>();
  for (const e of Object.values(events)) {
    if (e.scheduleId !== schedule.id || !e.seriesId || !e.seriesDate || e.repeat) continue;
    taken.set(e.seriesId, [...(taken.get(e.seriesId) ?? []), e]);
  }
  return {
    ...schedule,
    blocks: scheduleItems(schedule.id, events).map((e) => {
      const copies = taken.get(e.id) ?? [];
      const row = itemToBlock(e);
      return {
        ...row,
        exceptions: row.exceptions.filter((d) => !copies.some((c) => c.seriesDate === d)),
        committedDates: e.status === 'tentative' ? copies.filter((c) => c.status === 'confirmed').map((c) => c.seriesDate as string).sort() : [],
      };
    }),
  };
}
