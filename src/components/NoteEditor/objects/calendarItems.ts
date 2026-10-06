import { useCalendarStore } from '@/store/calendarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { expandRepeat, isOccurrenceSkipped } from '@/utils/recurrence';
import { addDaysToIso } from '@/utils/date';
import { resolveTimezone, todayIsoInZone } from '@/utils/timezone';
import type { CalendarDeadline, CalendarDeadlineId, CalendarReminder, CalendarReminderId, RepeatConfig } from '@/types';

// Reminders and Deadlines have the same shape; the note objects read and change them alike.
export type DatedKind = 'reminder' | 'deadline';
export type DatedItem = CalendarReminder | CalendarDeadline;

export function datedItem(kind: DatedKind, id: string): DatedItem | undefined {
  const cal = useCalendarStore.getState();
  return kind === 'reminder' ? cal.reminders[id as CalendarReminderId] : cal.deadlines[id as CalendarDeadlineId];
}

export function updateDated(kind: DatedKind, id: string, changes: Partial<DatedItem>): void {
  const cal = useCalendarStore.getState();
  if (kind === 'reminder') cal.updateReminder(id as CalendarReminderId, changes as Partial<CalendarReminder>);
  else cal.updateDeadline(id as CalendarDeadlineId, changes as Partial<CalendarDeadline>);
}

export const todayInZone = () => todayIsoInZone(resolveTimezone(useSettingsStore.getState().timezone));

// ── Repeating items ─────────────────────────────────────────────────────────

interface Repeating { date: string; repeat: RepeatConfig | null }

// The dates an item falls on between two days (inclusive): its own date, or every occurrence of
// its series (skipped ones left out).
export function occurrenceDates(item: Repeating, from: string, to: string): string[] {
  const inRange = (d: string) => d >= from && d <= to;
  if (!item.repeat) return inRange(item.date) ? [item.date] : [];
  const base = inRange(item.date) && !isOccurrenceSkipped(item.repeat, item.date) ? [item.date] : [];
  return [...base, ...expandRepeat(item.date, item.repeat, from, to)].sort();
}

const HORIZON_DAYS = 366 * 2;

// The occurrence a repeating item is "at" — what the note's pane shows and ticks: the first one
// from today on that isn't done (ticking it moves the pane on to the next, the way a recurring
// to-do does). Before the series starts, its first date; after it ends, its last. A one-off item
// is at its own date.
export function currentOccurrence(item: Repeating & { doneDates?: string[] }, today: string = todayInZone()): string {
  if (!item.repeat) return item.date;
  const done = new Set(item.doneDates ?? []);
  const upcoming = occurrenceDates(item, today, addDaysToIso(today, HORIZON_DAYS));
  const next = upcoming.find((d) => !done.has(d)) ?? upcoming[0];
  if (next) return next;
  const before = occurrenceDates(item, item.date, today);
  return before[before.length - 1] ?? item.date;
}

// A window of a series around its current occurrence, for the pane's list of dates: a few before
// (done, missed or past) and the next several.
export function occurrenceWindow(item: Repeating & { doneDates?: string[] }, before = 3, after = 8, today: string = todayInZone()): string[] {
  const current = currentOccurrence(item, today);
  const earlier = occurrenceDates(item, item.date, addDaysToIso(current, -1)).slice(-before);
  const later = occurrenceDates(item, current, addDaysToIso(current, HORIZON_DAYS)).slice(0, after + 1);
  return [...earlier, ...later];
}
