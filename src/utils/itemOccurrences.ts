import type { CalendarDeadline, CalendarEvent, ScheduleTemplate } from '@/types';
import { expandRepeat, isOccurrenceSkipped } from '@/utils/recurrence';
import { hiddenBySchedule } from '@/utils/scheduleItems';
import { addDaysToIso } from '@/utils/date';
import { BEHIND_DAYS } from '@/utils/rhythms';

// An Endeavour's repeating calendar items, date by date (docs/features/endeavours.md phase 7 (e)),
// pure: what the board on its home and Behind read, now that repeating work and classes are
// calendar items rather than rhythm streams. Two kinds, decided with the user 2026-10-30:
//   - Work (a repeating Deadline): done, skipped, or not; a past date not done is Behind (for
//     BEHIND_DAYS, then let go as missed).
//   - A class (a repeating event): attended (`attendedDates`), skipped, or not marked; never
//     Behind, but an unmarked past class is shown as not attended.
// A date taken out of its series ("only this one") is its own item; it stands in for that date,
// with its own done or attended mark. Marking is services/itemOccurrences.ts.

export type ItemKind = 'class' | 'work';
export type ItemState = 'done' | 'attended' | 'skipped' | 'behind' | 'missed' | 'notMarked' | 'today' | 'upcoming';

export interface RepeatingItem { kind: ItemKind; item: CalendarEvent | CalendarDeadline }

export interface ItemOccurrence {
  key:    string;                               // `${seriesId}|${date}` (the series' date it stands for)
  kind:   ItemKind;
  series: CalendarEvent | CalendarDeadline;
  copy:   CalendarEvent | CalendarDeadline | null;   // the date taken out, when it was
  date:   string;                               // when it falls (a taken-out date's own)
  time:   string | null;
  state:  ItemState;
}

const live = <T extends { archivedAt: string | null }>(x: T) => !x.archivedAt;

// Its repeating classes and Work, filed directly under it: the series, not dates taken out.
export function repeatingItemsOf(endeavourId: string, events: Record<string, CalendarEvent>, deadlines: Record<string, CalendarDeadline>, schedules: Record<string, ScheduleTemplate> = {}): RepeatingItem[] {
  const classes = Object.values(events)
    .filter((e) => e.collectionId === endeavourId && e.repeat && !e.seriesId && live(e) && !hiddenBySchedule(e, schedules))
    .map((item): RepeatingItem => ({ kind: 'class', item }));
  const work = Object.values(deadlines)
    .filter((d) => d.collectionId === endeavourId && d.repeat && !d.seriesId && d.deadlineType !== 'task' && live(d))
    .map((item): RepeatingItem => ({ kind: 'work', item }));
  return [...classes, ...work].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'class' ? -1 : 1) || a.item.title.localeCompare(b.item.title));
}

const timeOf = (x: CalendarEvent | CalendarDeadline) => ('startTime' in x ? x.startTime : x.time);
const marked = (x: CalendarEvent | CalendarDeadline, date: string, kind: ItemKind) =>
  kind === 'work' ? (x as CalendarDeadline).doneDates?.includes(date) : (x as CalendarEvent).attendedDates?.includes(date);

export function stateOf(kind: ItemKind, isMarked: boolean, skipped: boolean, date: string, today: string): ItemState {
  if (skipped) return 'skipped';
  if (isMarked) return kind === 'work' ? 'done' : 'attended';
  if (date === today) return 'today';
  if (date > today) return 'upcoming';
  if (kind === 'class') return 'notMarked';
  return date < addDaysToIso(today, -BEHIND_DAYS) ? 'missed' : 'behind';
}

// Each item's dates in [from, to]: the series' own (its skipped ones too, shown as skipped, but not
// the break days a Schedule or period added), with a date taken out shown at its own date.
export function itemOccurrences(
  items: RepeatingItem[], all: { events: Record<string, CalendarEvent>; deadlines: Record<string, CalendarDeadline> },
  from: string, to: string, today: string,
): ItemOccurrence[] {
  const out: ItemOccurrence[] = [];
  for (const { kind, item } of items) {
    const repeat = item.repeat!;
    const pool: (CalendarEvent | CalendarDeadline)[] = kind === 'class' ? Object.values(all.events) : Object.values(all.deadlines);
    const copies = new Map(pool.filter((x) => x.seriesId === item.id && x.seriesDate && !x.repeat && live(x)).map((x) => [x.seriesDate as string, x]));
    const breaks = new Set(repeat.breakSkips ?? []);
    const own = [...(isOccurrenceSkipped(repeat, item.date) ? [] : [item.date]), ...expandRepeat(item.date, repeat, item.date, to)];
    const skipped = (repeat.exceptions ?? []).filter((d) => !breaks.has(d) && !copies.has(d) && d >= item.date);
    // A date taken out is in the series' skipped dates: listed here, at its copy's date.
    for (const date of [...new Set([...own, ...skipped, ...[...copies.keys()].filter((d) => d >= item.date)])]) {
      const copy = copies.get(date) ?? null;
      const at = copy ? copy.date : date;
      if (at < from || at > to) continue;
      const isSkipped = !copy && skipped.includes(date);
      out.push({
        key: `${item.id}|${date}`, kind, series: item, copy, date: at, time: timeOf(copy ?? item),
        state: stateOf(kind, !!marked(copy ?? item, at, kind), isSkipped, at, today),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

// Work dates that are Behind: past, not done, not skipped, within BEHIND_DAYS (the deadline source
// of Overview lists them, so a home's Behind panel does too).
export function behindDates(d: CalendarDeadline, today: string): string[] {
  if (!d.repeat || d.archivedAt) return [];
  const from = addDaysToIso(today, -BEHIND_DAYS);
  const done = new Set(d.doneDates ?? []);
  const dates = [...(isOccurrenceSkipped(d.repeat, d.date) ? [] : [d.date]), ...expandRepeat(d.date, d.repeat, from, addDaysToIso(today, -1))];
  return [...new Set(dates)].filter((x) => x >= from && x < today && !done.has(x)).sort();
}
