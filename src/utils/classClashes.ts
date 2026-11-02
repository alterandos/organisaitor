import type { CalendarDeadline, CalendarEvent, ClassLink, RepeatConfig } from '@/types';
import { expandRepeat, isOccurrenceSkipped } from '@/utils/recurrence';

// Items that fall in a repeating class's time (docs/features/endeavours.md phase 7, agreed with the
// user 2026-10-30), pure. Asked only for a class of the item's own Endeavour: shown instead of the
// class that day (an in-class essay), during it (an in-class quiz, drawn on the class), or both, as
// a clash. Keeping the classes in step is services/classClashes.ts.

const toMin = (t: string | null | undefined) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// Whether a class falls on a date, its replaced dates not counted as skipped (they're still its).
function classFallsOn(ev: CalendarEvent, date: string): boolean {
  if (!ev.repeat) return ev.date === date;
  const replaced = new Set(ev.repeat.replacedSkips ?? []);
  const repeat: RepeatConfig = { ...ev.repeat, exceptions: (ev.repeat.exceptions ?? []).filter((d) => !replaced.has(d)) };
  if (ev.date === date) return !isOccurrenceSkipped(repeat, date);
  return date > ev.date && expandRepeat(ev.date, repeat, date, date).length > 0;
}

export interface Clash { event: CalendarEvent; date: string }

// The repeating classes of its Endeavour an item (one date, a time) falls in.
export function clashingClasses(
  item: { id?: string; date: string; start: string | null; end?: string | null; collectionId: string | null },
  events: Record<string, CalendarEvent>,
): Clash[] {
  const s = toMin(item.start);
  if (!item.collectionId || s === null) return [];
  const e = toMin(item.end) ?? s;
  return Object.values(events)
    .filter((ev) => ev.id !== item.id && ev.repeat && !ev.seriesId && !ev.archivedAt && ev.collectionId === item.collectionId && classFallsOn(ev, item.date))
    .filter((ev) => {
      const cs = toMin(ev.startTime), ce = toMin(ev.endTime) ?? cs;
      if (cs === null || ce === null) return false;
      return e === s ? s >= cs && s < ce : s < ce && e > cs;
    })
    .map((event) => ({ event, date: item.date }));
}

const holds = (x: { onClass?: ClassLink | null; date: string; archivedAt: string | null }, mode: ClassLink['mode']) =>
  !!x.onClass && x.onClass.mode === mode && !x.archivedAt && x.date === x.onClass.date;

// The dates each class is replaced on, by items still on that date.
export function replacedIndex(events: Record<string, CalendarEvent>, deadlines: Record<string, CalendarDeadline>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const x of [...Object.values(events), ...Object.values(deadlines)]) {
    if (!holds(x, 'replaces')) continue;
    out.set(x.onClass!.eventId, [...(out.get(x.onClass!.eventId) ?? []), x.onClass!.date]);
  }
  return out;
}

// What's drawn on each class date (`${classId}|${date}`): the items during it.
export function duringIndex(events: Record<string, CalendarEvent>, deadlines: Record<string, CalendarDeadline>): Map<string, { id: string; title: string }[]> {
  const out = new Map<string, { id: string; title: string }[]>();
  for (const x of [...Object.values(events), ...Object.values(deadlines)]) {
    if (!holds(x, 'during')) continue;
    const key = `${x.onClass!.eventId}|${x.onClass!.date}`;
    out.set(key, [...(out.get(key) ?? []), { id: x.id, title: x.title }]);
  }
  return out;
}

export const isDrawnOnClass = (x: { onClass?: ClassLink | null; date: string; archivedAt: string | null }) => holds(x, 'during');

// A class's repeat with its replaced dates skipped: the person's own skips (and a period's breaks)
// kept apart, so an item moved or deleted gives its date back.
export function withReplaced(repeat: RepeatConfig, dates: string[]): RepeatConfig {
  const before = new Set(repeat.replacedSkips ?? []);
  const own = (repeat.exceptions ?? []).filter((d) => !before.has(d));
  const ownSet = new Set(own);
  const added = [...new Set(dates)].filter((d) => !ownSet.has(d)).sort();
  const next: RepeatConfig = { ...repeat, exceptions: [...own, ...added].sort() };
  if (added.length) next.replacedSkips = added; else delete next.replacedSkips;
  return next;
}
