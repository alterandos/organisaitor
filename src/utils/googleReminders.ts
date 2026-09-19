import type { NotifyUnit } from '@/types';

// Google's own shapes (see the Events and CalendarList resources): an event either uses its
// calendar's default reminders (useDefault: true) or lists its own overrides. `minutes` is how
// long before the event's start; for an all-day event Google measures from midnight at the start
// of that day, so "1 day before at 9 AM" arrives as 900.
export interface GoogleReminder { method: string; minutes: number }
export interface GoogleEventReminders { useDefault?: boolean; overrides?: GoogleReminder[] }
export interface GoogleCalendarMeta { defaultReminders?: GoogleReminder[]; accessRole?: string }

// What an imported event gets when Google has no popup reminder to copy but the calendar is the
// user's own, so they'd still want to be told. Timed: half an hour ahead (a little more lead than
// Google's own 10-minute default). All-day: 7 hours before midnight = 17:00 the evening before,
// matching the default for whole-day Reminders (see notifyDefaults.ts).
export const FALLBACK_TIMED_MINUTES = 30;
export const FALLBACK_ALLDAY_MINUTES = 7 * 60;

export function minutesToNotify(minutes: number): { value: number; unit: NotifyUnit } {
  if (minutes > 0 && minutes % 1440 === 0) return { value: minutes / 1440, unit: 'days' };
  if (minutes > 0 && minutes % 60 === 0) return { value: minutes / 60, unit: 'hours' };
  return { value: minutes, unit: 'minutes' };
}

// Decides an imported event's "notify before". Only popup reminders count as notifications
// (email/SMS aren't something this app can do), and this app holds one lead time per event, so
// of several popups the one closest to the start wins — the "time to go" alert rather than the
// early heads-up.
//   1. Copy Google's popup reminder: the event's own, or its calendar's default if it uses those.
//   2. Reminders deliberately cleared in Google (useDefault false, nothing listed) stay off.
//   3. Otherwise fall back to a sensible default — but only on calendars the user can write to.
//      A read-only one (public holidays, a subscribed timetable) would otherwise notify for
//      every entry. accessRole unknown (older imports) counts as the user's own.
export function deriveNotifyBefore(
  reminders: GoogleEventReminders | undefined,
  meta: GoogleCalendarMeta | undefined,
  allDay: boolean,
): { value: number | null; unit: NotifyUnit } {
  const useDefault = reminders?.useDefault ?? true;
  const source = useDefault ? meta?.defaultReminders : reminders?.overrides;
  const popups = (source ?? []).filter((r) => r.method === 'popup' && r.minutes >= 0);
  if (popups.length > 0) return minutesToNotify(Math.min(...popups.map((r) => r.minutes)));

  if (!useDefault && (reminders?.overrides ?? []).length === 0) return { value: null, unit: 'hours' };

  const role = meta?.accessRole;
  if (role && role !== 'owner' && role !== 'writer') return { value: null, unit: 'hours' };
  return minutesToNotify(allDay ? FALLBACK_ALLDAY_MINUTES : FALLBACK_TIMED_MINUTES);
}
