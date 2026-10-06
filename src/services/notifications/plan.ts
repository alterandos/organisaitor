import type {
  CalendarDeadline, CalendarEvent, CalendarReminder, ScheduleTemplate, Task,
} from '@/types';
import { formatTime, addDaysToIso } from '@/utils/date';
import { zonedTimeToUtc, utcToZonedTime } from '@/utils/timezone';
import { expandRepeat, isOccurrenceSkipped } from '@/utils/recurrence';
import type { ClockFormat } from '@/utils/date';

// THE notification rules, for every platform (docs/android/05-notifications.md N1). Pure: given a
// snapshot of the stores and a time window, it lists every notification due in that window. The
// desktop/web poller (hooks/useNotificationChecker.ts) fires what's due now; the Android scheduler
// (services/notifications/androidScheduler.ts) books the next two weeks with the OS. A change to
// when or how something notifies goes here, and both platforms follow.

export type PlannedKind = 'event' | 'reminder' | 'deadline' | 'schedule';

export interface PlannedNotification {
  key:        string;        // stable per occurrence (or snooze): `${kind}:${itemId}:${occurrence}`
  kind:       PlannedKind;
  itemId:     string;        // the event/reminder/deadline id; for a schedule, `${scheduleId}::${blockId}::${date}`
  occurrence: string;        // YYYY-MM-DD — which occurrence of a repeating item this is
  at:         Date;
  title:      string;
  body:       string;
  important:  boolean;
  taskId:     string | null; // a task-deadline (or legacy task reminder): the task it belongs to
}

export interface NotificationSnapshot {
  tasks:     Record<string, Task>;
  events:    Record<string, CalendarEvent>;
  reminders: Record<string, CalendarReminder>;
  deadlines: Record<string, CalendarDeadline>;
  schedules: Record<string, ScheduleTemplate>;
}

export interface PlanOptions {
  from:        Date;
  to:          Date;
  zone:        string;
  clockFormat: ClockFormat;
}

// A committed Schedule occurrence gets a fixed 30-minute-before nudge (deliberately not
// configurable per block — see CLAUDE.md "Schedule commitment mode").
const SCHEDULE_NOTIFY_BEFORE_MIN = 30;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function leadMinutes(value: number, unit: 'minutes' | 'hours' | 'days'): number {
  return unit === 'days' ? value * 1440 : unit === 'hours' ? value * 60 : value;
}

// The item's own date plus, for a repeating item, every occurrence in [start, end].
function occurrences(date: string, repeat: CalendarEvent['repeat'], start: string, end: string): string[] {
  const dates: string[] = [];
  if (date >= start && date <= end && !isOccurrenceSkipped(repeat, date)) dates.push(date);
  if (repeat) dates.push(...expandRepeat(date, repeat, start, end));
  return dates;
}

// "today" / "tomorrow" / "in 3 days", counted from the day the notification lands to the day it's about.
function whenFrom(trigger: Date, occurrence: string, zone: string): string {
  const from = Date.parse(utcToZonedTime(trigger, zone).date + 'T00:00:00Z');
  const days = Math.round((Date.parse(occurrence + 'T00:00:00Z') - from) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

export function planNotifications(snap: NotificationSnapshot, opts: PlanOptions): PlannedNotification[] {
  const { from, to, zone, clockFormat } = opts;
  const out: PlannedNotification[] = [];
  const inWindow = (at: Date) => at.getTime() >= from.getTime() && at.getTime() <= to.getTime();
  const fromDate = addDaysToIso(utcToZonedTime(from, zone).date, -1);
  const toDate = utcToZonedTime(to, zone).date;
  // Occurrences that can notify inside the window: their trigger is at most `leadDays` before them.
  const range = (leadDays: number) => [fromDate, addDaysToIso(toDate, leadDays + 1)] as const;

  // A snooze (remindAt) re-notifies ONE occurrence — remindOccurrence (the series' own date for a
  // snooze from before 2026-10-06) — at the snooze time, and replaces that occurrence's normal
  // notification if it hadn't come yet. Other occurrences are untouched. Nothing re-notifies an
  // occurrence that's been dealt with since (`settled`: done, or acknowledged).
  type Snoozable = { id: string; title: string; remindAt: string | null; remindOccurrence?: string | null; date: string; important: boolean };
  const snooze = (kind: PlannedKind, item: Snoozable, taskId: string | null, body: string, settled: (date: string) => boolean) => {
    if (!item.remindAt) return null;
    const occurrence = item.remindOccurrence ?? item.date;
    if (settled(occurrence)) return null;
    const at = new Date(item.remindAt);
    if (inWindow(at)) out.push({ key: `${kind}:${item.id}:snooze:${item.remindAt}`, kind, itemId: item.id, occurrence, at, title: item.title, body, important: item.important, taskId });
    return { at, occurrence };
  };
  const snoozedAway = (s: { at: Date; occurrence: string } | null, date: string, at: Date) => !!s && s.occurrence === date && at <= s.at;

  const taskByReminder = new Map<string, Task>();
  const taskByDeadline = new Map<string, Task>();
  for (const t of Object.values(snap.tasks)) {
    if (t.calendarReminderId) taskByReminder.set(t.calendarReminderId, t);
    if (t.calendarDeadlineId) taskByDeadline.set(t.calendarDeadlineId, t);
  }
  const taskDone = (t: Task | undefined) => !t || t.completed || t.archived;

  // ── Events: notify-before, counted back from the start (an all-day event from midnight) ──
  for (const ev of Object.values(snap.events)) {
    if (ev.archivedAt) continue;
    const seen = (date: string) => (ev.seenDates ?? []).includes(date);
    const snoozed = snooze('event', ev, null, 'Snoozed', seen);
    if (ev.notifyBeforeValue === null) continue;
    const lead = leadMinutes(ev.notifyBeforeValue, ev.notifyBeforeUnit);
    const [start, end] = range(Math.ceil(lead / 1440));
    for (const date of occurrences(ev.date, ev.repeat, start, end)) {
      if (seen(date)) continue;
      const at = new Date(zonedTimeToUtc(date, ev.startTime ?? '00:00', zone).getTime() - lead * MIN);
      if (!inWindow(at) || snoozedAway(snoozed, date, at)) continue;
      // Imported events arrive with their history; don't announce what passed before they existed.
      if (ev.source && at.getTime() < Date.parse(ev.createdAt)) continue;
      const body = ev.startTime ? `Starting at ${formatTime(ev.startTime, clockFormat)}` : `All day ${whenFrom(at, date, zone)}`;
      out.push({ key: `event:${ev.id}:${date}`, kind: 'event', itemId: ev.id, occurrence: date, at, title: ev.title, body, important: ev.important, taskId: null });
    }
  }

  // ── Reminders: at their time; a whole-day one at its own notify moment (default the evening before) ──
  for (const rem of Object.values(snap.reminders)) {
    if (rem.archivedAt) continue;
    const linkedTask = rem.reminderType === 'task' ? taskByReminder.get(rem.id) : undefined;
    if (rem.reminderType === 'task' && taskDone(linkedTask)) continue;
    const label = rem.reminderType === 'task' ? 'Due' : 'Reminder';
    const remDone = (date: string) => (rem.doneDates ?? []).includes(date);
    const snoozed = snooze('reminder', rem, linkedTask?.id ?? null, `${label} (snoozed)`, remDone);
    const [start, end] = range(rem.time ? 0 : rem.notifyDaysBefore);
    for (const date of occurrences(rem.date, rem.repeat, start, end)) {
      if (remDone(date)) continue;
      const at = rem.time
        ? zonedTimeToUtc(date, rem.time, zone)
        : zonedTimeToUtc(addDaysToIso(date, -rem.notifyDaysBefore), rem.notifyAtTime, zone);
      if (!inWindow(at) || snoozedAway(snoozed, date, at)) continue;
      // A whole-day moment that passed before the reminder existed isn't worth announcing.
      if (!rem.time && at.getTime() < Date.parse(rem.createdAt)) continue;
      const body = rem.time ? `${label} at ${formatTime(rem.time, clockFormat)}` : `${label} ${whenFrom(at, date, zone)}`;
      out.push({ key: `reminder:${rem.id}:${date}`, kind: 'reminder', itemId: rem.id, occurrence: date, at, title: rem.title, body, important: rem.important, taskId: linkedTask?.id ?? null });
    }
  }

  // ── Deadlines: only ever BEFORE (notifyDaysBefore + notifyAtTime), even with a time set ──
  for (const dl of Object.values(snap.deadlines)) {
    if (dl.archivedAt) continue;
    const linkedTask = dl.deadlineType === 'task' ? taskByDeadline.get(dl.id) : undefined;
    if (dl.deadlineType === 'task' && taskDone(linkedTask)) continue;
    const settled = (date: string) => (dl.doneDates ?? []).includes(date) || (dl.seenDates ?? []).includes(date);
    const snoozed = snooze('deadline', dl, linkedTask?.id ?? null, 'Due (snoozed)', settled);
    const [start, end] = range(dl.notifyDaysBefore);
    for (const date of occurrences(dl.date, dl.repeat, start, end)) {
      if (settled(date)) continue;
      const at = zonedTimeToUtc(addDaysToIso(date, -dl.notifyDaysBefore), dl.notifyAtTime, zone);
      if (!inWindow(at) || snoozedAway(snoozed, date, at)) continue;
      if (at.getTime() < Date.parse(dl.createdAt)) continue;
      const body = `Due ${whenFrom(at, date, zone)}${dl.time ? ` at ${formatTime(dl.time, clockFormat)}` : ''}`;
      out.push({ key: `deadline:${dl.id}:${date}`, kind: 'deadline', itemId: dl.id, occurrence: date, at, title: dl.title, body, important: dl.important, taskId: linkedTask?.id ?? null });
    }
  }

  // ── Committed Schedule occurrences (commitment mode only) ──
  for (const schedule of Object.values(snap.schedules)) {
    if (!schedule.active) continue;
    for (const block of schedule.blocks) {
      if (!block.requiresCommitment) continue;
      for (const date of block.committedDates ?? []) {
        const at = new Date(zonedTimeToUtc(date, block.startTime, zone).getTime() - SCHEDULE_NOTIFY_BEFORE_MIN * MIN);
        if (!inWindow(at)) continue;
        const itemId = `${schedule.id}::${block.id}::${date}`;
        out.push({ key: `schedule:${itemId}`, kind: 'schedule', itemId, occurrence: date, at, title: block.title, body: `Committed — starting at ${formatTime(block.startTime, clockFormat)}`, important: false, taskId: null });
      }
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
