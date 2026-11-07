import type { CalendarDeadline, CalendarEvent, ClassLink, RepeatConfig } from '@/types';
import { expandRepeat, isOccurrenceSkipped, occurrenceTime } from '@/utils/recurrence';
import { addDaysToIso } from '@/utils/date';

// Clashes between calendar items (docs/features/endeavours.md phase 7, agreed with the user
// 2026-10-30; widened 2026-11-07), pure. An item being made or edited that falls in the time of
// another confirmed, timed event, of any Endeavour, is asked how it shows: instead of that event on
// those dates (only when that event repeats: its dates are skipped), during it (drawn on it), or
// both, as a clash. A repeating item is asked once, for every one of its dates that falls in the
// other (a link with no `date`). Tentative items never clash (a Schedule item you choose each time
// whether to go to, a maybe). Keeping the other's dates in step is services/classClashes.ts.

const toMin = (t: string | null | undefined) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// How far a repeating item's dates are read for clashes.
const SERIES_DAYS = 730;

// Whether an event falls on a date, its replaced dates not counted as skipped (they're still its).
function fallsOn(ev: CalendarEvent, date: string): boolean {
  if (!ev.repeat) return ev.date === date;
  const replaced = new Set(ev.repeat.replacedSkips ?? []);
  const repeat: RepeatConfig = { ...ev.repeat, exceptions: (ev.repeat.exceptions ?? []).filter((d) => !replaced.has(d)) };
  if (ev.date === date) return !isOccurrenceSkipped(repeat, date);
  return date > ev.date && expandRepeat(ev.date, repeat, date, date).length > 0;
}

// What an item can clash with: confirmed, timed, within one day, not a task's own calendar copy,
// not a date taken out of a series as an item of its own when it still repeats.
const clashable = (ev: CalendarEvent) =>
  !ev.archivedAt && (ev.status ?? 'confirmed') === 'confirmed' && !!ev.startTime && ev.eventType !== 'task'
  && !(ev.endDate && ev.endDate > ev.date) && !(ev.seriesId && ev.repeat);

const overlaps = (s: number, e: number, cs: number, ce: number) => (e === s ? s >= cs && s < ce : s < ce && e > cs);

// An item's dates: its own, or a repeating one's from its first for two years.
function itemDates(date: string, repeat: RepeatConfig | null | undefined): string[] {
  if (!repeat) return [date];
  const rest = expandRepeat(date, repeat, date, addDaysToIso(date, SERIES_DAYS));
  return isOccurrenceSkipped(repeat, date) ? rest : [date, ...rest];
}

export interface ClashItem {
  id?: string;
  date: string;
  start: string | null;
  end?: string | null;
  repeat?: RepeatConfig | null;
  status?: 'confirmed' | 'tentative';
}

// One event the item clashes with, and on which of the item's dates.
export interface Clash { event: CalendarEvent; dates: string[] }

export function clashingClasses(item: ClashItem, events: Record<string, CalendarEvent>): Clash[] {
  if (item.status === 'tentative' || toMin(item.start) === null) return [];
  const dates = itemDates(item.date, item.repeat);
  const span = (d: string) => {
    const at = occurrenceTime(item.repeat, d, item.start);
    const s = toMin(at)!;
    const e = toMin(item.end) !== null && item.start ? s + Math.max(0, toMin(item.end)! - toMin(item.start)!) : s;
    return [s, e] as const;
  };
  const out: Clash[] = [];
  for (const ev of Object.values(events)) {
    if (ev.id === item.id || (item.id && ev.seriesId === item.id) || !clashable(ev)) continue;
    const hit = dates.filter((d) => {
      if (!fallsOn(ev, d)) return false;
      const cs = toMin(occurrenceTime(ev.repeat, d, ev.startTime));
      if (cs === null) return false;
      // Its length from its own start and end; one with no end is a moment.
      const ce = cs + Math.max(1, (toMin(ev.endTime) ?? toMin(ev.startTime)!) - toMin(ev.startTime)!);
      const [s, e] = span(d);
      return overlaps(s, e, cs, ce);
    });
    if (hit.length) out.push({ event: ev, dates: hit });
  }
  return out.sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
}

type Linked = { id: string; onClass?: ClassLink | null; date: string; archivedAt: string | null; repeat?: RepeatConfig | null; time: string | null; endTime: string | null };

// The dates a link holds for: a one-off item's own date while it's still the link's; a repeating
// item's every date that falls in the other event (worked out again, so moving either keeps them).
function linkedDates(x: Linked, mode: ClassLink['mode'], events: Record<string, CalendarEvent>): string[] {
  const link = x.onClass;
  if (!link || link.mode !== mode || x.archivedAt) return [];
  if (link.date) return x.date === link.date && !x.repeat ? [link.date] : [];
  const other = events[link.eventId];
  if (!other) return [];
  return clashingClasses({ id: x.id, date: x.date, start: x.time, end: x.endTime, repeat: x.repeat }, { [other.id]: other })[0]?.dates ?? [];
}

const linkedItems = (events: Record<string, CalendarEvent>, deadlines: Record<string, CalendarDeadline>): { kind: 'event' | 'deadline'; x: Linked; title: string }[] => [
  ...Object.values(events).filter((e) => e.onClass).map((e) => ({ kind: 'event' as const, title: e.title, x: { id: e.id, onClass: e.onClass, date: e.date, archivedAt: e.archivedAt, repeat: e.repeat, time: e.startTime, endTime: e.endTime } })),
  ...Object.values(deadlines).filter((d) => d.onClass).map((d) => ({ kind: 'deadline' as const, title: d.title, x: { id: d.id, onClass: d.onClass, date: d.date, archivedAt: d.archivedAt, repeat: d.repeat, time: d.time, endTime: null } })),
];

// The dates each repeating event is replaced on, by items still on those dates.
export function replacedIndex(events: Record<string, CalendarEvent>, deadlines: Record<string, CalendarDeadline>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { x } of linkedItems(events, deadlines)) {
    const dates = linkedDates(x, 'replaces', events);
    if (dates.length) out.set(x.onClass!.eventId, [...(out.get(x.onClass!.eventId) ?? []), ...dates]);
  }
  return out;
}

// An item drawn during an event: enough to draw it inside the event and open it.
export interface DuringEntry { kind: 'event' | 'deadline'; id: string; title: string; time: string | null; endTime: string | null }

// What's drawn on each event date (`${eventId}|${date}`): the items during it, by time.
export function duringIndex(events: Record<string, CalendarEvent>, deadlines: Record<string, CalendarDeadline>): Map<string, DuringEntry[]> {
  const out = new Map<string, DuringEntry[]>();
  for (const { kind, x, title } of linkedItems(events, deadlines)) {
    for (const d of linkedDates(x, 'during', events)) {
      const key = `${x.onClass!.eventId}|${d}`;
      const time = occurrenceTime(x.repeat, d, x.time);
      out.set(key, [...(out.get(key) ?? []), { kind, id: x.id, title, time, endTime: x.endTime }].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')));
    }
  }
  return out;
}

// The dates of items drawn on another event rather than on their own (`${itemId}|${date}`).
export function drawnOnOthers(during: Map<string, DuringEntry[]>): Set<string> {
  const out = new Set<string>();
  for (const [key, list] of during) {
    const date = key.slice(key.lastIndexOf('|') + 1);
    for (const e of list) out.add(`${e.id}|${date}`);
  }
  return out;
}

// A repeating event's repeat with its replaced dates skipped: the person's own skips (and a
// period's breaks) kept apart, so an item moved or deleted gives its date back.
export function withReplaced(repeat: RepeatConfig, dates: string[]): RepeatConfig {
  const before = new Set(repeat.replacedSkips ?? []);
  const own = (repeat.exceptions ?? []).filter((d) => !before.has(d));
  const ownSet = new Set(own);
  const added = [...new Set(dates)].filter((d) => !ownSet.has(d)).sort();
  const next: RepeatConfig = { ...repeat, exceptions: [...own, ...added].sort() };
  if (added.length) next.replacedSkips = added; else delete next.replacedSkips;
  return next;
}
