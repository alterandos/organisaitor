import type { CalendarDeadlineId, CalendarEvent, CalendarEventId, CalendarReminderId, TaskId } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useNotificationStore, type NotificationKind } from '@/store/notificationStore';
import { toggleTaskCompletion } from '@/services/taskCompletion';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { updateCalendarEventLinked, updateTaskLinked } from '@/services/taskCalendarLinks';
import { utcToZonedTime, zonedTimeToUtc } from '@/utils/timezone';
import { addDaysToIso, timeAddMinutes } from '@/utils/date';

// What acting on a notification does — the same whether it's the in-app bell (NotificationCenter)
// or a button on an Android system notification (androidScheduler.ts). Re-specced with the user
// 2026-10-06 (docs/android/05-notifications.md "Notification actions"):
//   Got it   — "I've noted it": a reminder is done (struck out); an event's or deadline's
//              notification is acknowledged (it still happens / is still due). Synced, so no
//              device notifies that occurrence again. ✕ on a card is the same.
//   Done     — deadlines: the work is done (struck out). A task's deadline completes the task.
//   Snooze   — notify that occurrence again later; nothing else moves.
//   Postpone — move the occurrence itself (a repeating item: just that date, taken out of the
//              series and still linked to it).
//   Archive  — archive that occurrence (likewise), or with "the whole series" ticked, all of it.
//   Open     — that occurrence, in the calendar.
// "Clear all" in the bell only empties this device's bell.

type CalendarKind = 'event' | 'reminder' | 'deadline';
const isCalendarKind = (kind: NotificationKind): kind is CalendarKind => kind === 'event' || kind === 'reminder' || kind === 'deadline';

function itemOf(kind: CalendarKind, id: string) {
  const cal = useCalendarStore.getState();
  return kind === 'event' ? cal.events[id as CalendarEventId] : kind === 'reminder' ? cal.reminders[id as CalendarReminderId] : cal.deadlines[id as CalendarDeadlineId];
}

function update(kind: CalendarKind, id: string, changes: Record<string, unknown>) {
  const cal = useCalendarStore.getState();
  if (kind === 'event') updateCalendarEventLinked(id as CalendarEventId, changes);
  else if (kind === 'reminder') cal.updateReminder(id as CalendarReminderId, changes);
  else cal.updateDeadline(id as CalendarDeadlineId, changes);
}

// A repeating item's one occurrence, taken out of the series (still linked to it — seriesId) so it
// can be changed alone; a one-off item is itself. Returns the id of the item that is now that date.
function soloOccurrence(kind: CalendarKind, id: string, occurrence: string): string {
  const item = itemOf(kind, id);
  if (!item?.repeat) return id;
  const cal = useCalendarStore.getState();
  const copy = kind === 'event' ? cal.detachEventOccurrence(id as CalendarEventId, occurrence)
    : kind === 'reminder' ? cal.detachReminderOccurrence(id as CalendarReminderId, occurrence)
    : cal.detachDeadlineOccurrence(id as CalendarDeadlineId, occurrence);
  return copy ?? id;
}

// ── Snooze ──────────────────────────────────────────────────────────────────

export type SnoozePreset = '10m' | '1h' | 'evening' | 'morning';

// When a snooze preset ends. "This evening" is today at the evening time, or tomorrow's if that has
// passed; "Tomorrow" is tomorrow at the morning time — both in the account timezone.
export function snoozeTime(preset: SnoozePreset, now: Date, zone: string, morning: string, evening: string): Date {
  if (preset === '10m') return new Date(now.getTime() + 10 * 60_000);
  if (preset === '1h') return new Date(now.getTime() + 60 * 60_000);
  const today = utcToZonedTime(now, zone).date;
  if (preset === 'morning') return zonedTimeToUtc(addDaysToIso(today, 1), morning, zone);
  const tonight = zonedTimeToUtc(today, evening, zone);
  return tonight > now ? tonight : zonedTimeToUtc(addDaysToIso(today, 1), evening, zone);
}

// Snooze = set the item's remindAt (synced, so every device respects it) for that one occurrence
// (remindOccurrence); services/notifications/plan.ts turns it into one more notification.
export function snoozeNotificationTarget(kind: NotificationKind, itemId: string, untilIso: string, occurrence?: string): void {
  if (isCalendarKind(kind)) {
    const item = itemOf(kind, itemId);
    if (item) update(kind, itemId, { remindAt: untilIso, remindOccurrence: occurrence ?? item.date });
  } else if (kind === 'task-timed' || kind === 'task-untimed') {
    useTaskStore.getState().updateTask(itemId as TaskId, { remindAt: untilIso });
  }
}

// ── Got it / Done ───────────────────────────────────────────────────────────

// "Got it": a reminder's occurrence is done; an event's or deadline's is acknowledged (seenDates).
export function acknowledgeOccurrence(kind: NotificationKind, itemId: string, occurrence?: string): void {
  if (!isCalendarKind(kind)) return;
  const item = itemOf(kind, itemId);
  if (!item) return;
  const date = occurrence ?? item.date;
  const cal = useCalendarStore.getState();
  if (kind === 'reminder') cal.setOccurrenceDone('reminder', itemId as CalendarReminderId, date, true);
  else cal.setOccurrenceSeen(kind, itemId as CalendarEventId | CalendarDeadlineId, date);
}

// "Done" on a Reminder or Deadline occurrence: struck through on the calendar, no more notifications.
export function markOccurrenceDone(kind: NotificationKind, itemId: string, occurrence: string | undefined): void {
  if (kind !== 'reminder' && kind !== 'deadline') return;
  const item = itemOf(kind, itemId);
  if (!item) return;
  useCalendarStore.getState().setOccurrenceDone(kind, itemId as CalendarReminderId | CalendarDeadlineId, occurrence ?? item.date, true);
}

// Completes the task a notification is about (a task deadline). Never reopens one.
export function completeNotificationTask(taskId: string): void {
  const task = useTaskStore.getState().tasks[taskId as TaskId];
  if (task && !task.completed) void toggleTaskCompletion(task.id);
}

// ── Postpone ────────────────────────────────────────────────────────────────

export type PostponePreset = 'tomorrow' | 'next-week';

// The date a preset postpones to (literally tomorrow / a week from today, in the account timezone),
// or null when that wouldn't move the occurrence later (a deadline already due tomorrow).
export function postponeDate(preset: PostponePreset, occurrence: string, today: string): string | null {
  const date = addDaysToIso(today, preset === 'tomorrow' ? 1 : 7);
  return date > occurrence ? date : null;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);
const minutesOf = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// Moves the occurrence to a new date (and time, if given; otherwise it keeps its own). A repeating
// item moves just that date. A task's deadline moves the task's deadline (its calendar entry
// follows). An event keeps its length. Returns the id of the item now at the new date.
export function postponeOccurrence(kind: NotificationKind, itemId: string, occurrence: string | undefined, to: { date: string; time?: string | null }, taskId?: string | null): string | null {
  if (!isCalendarKind(kind)) return null;
  const item = itemOf(kind, itemId);
  if (!item) return null;
  if (taskId && kind !== 'event') {
    const task = useTaskStore.getState().tasks[taskId as TaskId];
    if (task) {
      updateTaskLinked(task.id, { deadline: to.date, deadlineTime: to.time !== undefined ? to.time : task.deadlineTime });
      return itemId;
    }
  }
  const date = occurrence ?? item.date;
  // A snooze waiting on this occurrence is replaced by the move.
  if (item.remindOccurrence === date || (!item.remindOccurrence && item.remindAt)) update(kind, itemId, { remindAt: null, remindOccurrence: null });
  const target = soloOccurrence(kind, itemId, date);
  if (kind === 'event') {
    const ev = itemOf('event', target) as CalendarEvent;
    const start = to.time !== undefined ? to.time : ev.startTime;
    const length = ev.startTime && ev.endTime ? minutesOf(ev.endTime) - minutesOf(ev.startTime) : null;
    const shift = daysBetween(ev.date, to.date);
    update('event', target, {
      date:      to.date,
      endDate:   ev.endDate ? addDaysToIso(ev.endDate, shift) : null,
      startTime: start,
      endTime:   start && length !== null && length > 0 ? timeAddMinutes(start, length) : to.time !== undefined ? null : ev.endTime,
      remindAt:  null, remindOccurrence: null,
    });
  } else {
    update(kind, target, { date: to.date, time: to.time !== undefined ? to.time : (item as { time: string | null }).time, remindAt: null, remindOccurrence: null });
  }
  return target;
}

// ── Archive ─────────────────────────────────────────────────────────────────

// Archives the occurrence (a repeating item: that date only, taken out of the series and archived,
// still linked to it), or with wholeSeries the item itself. A task's deadline archives the task.
// Returns what to restore for an Undo.
export function archiveOccurrence(kind: NotificationKind, itemId: string, occurrence: string | undefined, wholeSeries: boolean, taskId?: string | null): (() => void) | null {
  if (taskId) {
    const tasks = useTaskStore.getState();
    if (!tasks.tasks[taskId as TaskId]) return null;
    tasks.archiveTask(taskId as TaskId);
    return () => useTaskStore.getState().restoreTask(taskId as TaskId);
  }
  if (!isCalendarKind(kind)) return null;
  const item = itemOf(kind, itemId);
  if (!item) return null;
  const target = wholeSeries ? itemId : soloOccurrence(kind, itemId, occurrence ?? item.date);
  const cal = useCalendarStore.getState();
  if (kind === 'event') { cal.archiveEvent(target as CalendarEventId); return () => useCalendarStore.getState().restoreEvent(target as CalendarEventId); }
  if (kind === 'reminder') { cal.archiveReminder(target as CalendarReminderId); return () => useCalendarStore.getState().restoreReminder(target as CalendarReminderId); }
  cal.archiveDeadline(target as CalendarDeadlineId);
  return () => useCalendarStore.getState().restoreDeadline(target as CalendarDeadlineId);
}

// ── Open / bell ─────────────────────────────────────────────────────────────

// Opens what the notification is about, in its section — the occurrence it's about.
export function openNotificationTarget(kind: NotificationKind, itemId: string, occurrence?: string): void {
  if (kind === 'schedule') {
    const ui = useUIStore.getState();
    ui.setActiveView('calendar');
    if (occurrence) ui.requestCalendarDate(occurrence);
    return;
  }
  if (kind === 'task-timed' || kind === 'task-untimed') { openArtifactTarget('task', itemId); return; }
  const item = itemOf(kind, itemId);
  openArtifactTarget(kind, itemId, item?.repeat ? occurrence : undefined);
}

// Once acted on from anywhere, the matching bell card goes too.
export function clearNotificationCard(key: string | undefined): void {
  if (key) useNotificationStore.getState().removePendingByKey(key);
}
