import type { CalendarEvent, RepeatConfig } from '@/types';
import { addDaysToIso, todayIso } from '@/utils/date';
import { expandRepeat, isOccurrenceSkipped } from '@/utils/recurrence';

// The dates of a repeat that follows other events ("1 day before each GEOS215 lecture",
// docs/features/endeavours.md phase 7), pure: each followed event's dates, moved by the offset.
// A followed event's own repeat gives its dates, less the dates skipped; one taken out of its
// series and moved ("only this one") counts at its new date. A series with no end is followed a
// year ahead (worked out again whenever anything changes, so it keeps going).

export const FOLLOW_AHEAD_DAYS = 366;

export function followedDates(follows: NonNullable<RepeatConfig['follows']>, events: Record<string, CalendarEvent>, today = todayIso()): string[] {
  // The followed events and every copy taken out of them ("only this one", "this and following"),
  // which stand in for their dates.
  const ids = new Set(follows.ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of Object.values(events)) if (e.seriesId && ids.has(e.seriesId) && !ids.has(e.id)) { ids.add(e.id); grew = true; }
  }
  const out = new Set<string>();
  for (const id of ids) {
    const ev = events[id];
    if (!ev || ev.archivedAt) continue;
    const end = ev.repeat?.endKind === 'until' && ev.repeat.until ? ev.repeat.until : addDaysToIso(today, FOLLOW_AHEAD_DAYS);
    const dates = [...(isOccurrenceSkipped(ev.repeat, ev.date) ? [] : [ev.date]), ...(ev.repeat ? expandRepeat(ev.date, ev.repeat, ev.date, end) : [])];
    for (const d of dates) out.add(addDaysToIso(d, follows.offsetDays));
  }
  return [...out].sort();
}

// The repeat with its dates brought into step, or null when they already are.
export function inStep(repeat: RepeatConfig, events: Record<string, CalendarEvent>, today = todayIso()): RepeatConfig | null {
  if (repeat.freq !== 'dates' || !repeat.follows) return null;
  const dates = followedDates(repeat.follows, events, today);
  const was = repeat.dates ?? [];
  if (dates.length === was.length && dates.every((d, i) => d === was[i])) return null;
  return { ...repeat, dates };
}
