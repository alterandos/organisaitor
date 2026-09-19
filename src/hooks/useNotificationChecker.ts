import { useEffect } from 'react';
import type { CalendarEvent, CalendarReminder, ScheduleId } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { fireOSNotification } from '@/services/notificationService';
import { formatTime, addDaysToIso } from '@/utils/date';
import { zonedTimeToUtc, utcToZonedTime, resolveTimezone } from '@/utils/timezone';
import { isOccurrenceSkipped } from '@/utils/recurrence';
import { DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE, DEFAULT_ALLDAY_NOTIFY_AT_TIME } from '@/config/notifyDefaults';

function toMinutes(value: number, unit: 'minutes' | 'hours' | 'days'): number {
  if (unit === 'hours') return value * 60;
  if (unit === 'days') return value * 1440;
  return value;
}

function eventTrigger(event: CalendarEvent, zone: string): Date | null {
  if (event.remindAt) return new Date(event.remindAt);
  if (event.notifyBeforeValue === null) return null;
  if (isOccurrenceSkipped(event.repeat, event.date)) return null;
  // An all-day event has no start time: its lead time counts back from midnight at the start of
  // its day, which is how Google measures it too ("1 day before at 9 AM" = 15 hours).
  const start = zonedTimeToUtc(event.date, event.startTime ?? '00:00', zone);
  const mins  = toMinutes(event.notifyBeforeValue, event.notifyBeforeUnit);
  const trigger = new Date(start.getTime() - mins * 60_000);
  // Importing an account brings in the last month of events; announcing all of those, or anything
  // that was over a day ago, would just be noise.
  if (trigger.getTime() < Date.now() - 24 * 60 * 60_000) return null;
  if (event.source && trigger.getTime() < new Date(event.createdAt).getTime()) return null;
  return trigger;
}

// An all-day event's notification can land the evening before, so "Today" would be wrong.
function allDayBody(eventDate: string, trigger: Date, zone: string): string {
  const from = new Date(utcToZonedTime(trigger, zone).date + 'T00:00:00').getTime();
  const days = Math.round((new Date(eventDate + 'T00:00:00').getTime() - from) / 86_400_000);
  return days <= 0 ? 'All day today' : days === 1 ? 'All day tomorrow' : `All day in ${days} days`;
}

function reminderTrigger(rem: CalendarReminder, zone: string): Date | null {
  if (rem.remindAt) return new Date(rem.remindAt);
  if (isOccurrenceSkipped(rem.repeat, rem.date)) return null;
  if (rem.time) return zonedTimeToUtc(rem.date, rem.time, zone);

  // Whole-day reminder: fires at its own configured moment (default the evening before).
  const trigger = zonedTimeToUtc(
    addDaysToIso(rem.date, -(rem.notifyDaysBefore ?? DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE)),
    rem.notifyAtTime ?? DEFAULT_ALLDAY_NOTIFY_AT_TIME,
    zone,
  );
  // A moment that passed before the reminder existed, or long ago, isn't worth announcing —
  // otherwise every pre-existing whole-day reminder would fire the first time this ran.
  if (trigger.getTime() < new Date(rem.createdAt).getTime()) return null;
  if (trigger.getTime() < Date.now() - 24 * 60 * 60_000) return null;
  return trigger;
}

// A committed Schedule occurrence (see ScheduleBlock.requiresCommitment/committedDates,
// CLAUDE.md "Schedule commitment mode") gets a fixed 30-minute-before nudge — deliberately
// not user-configurable per block, to avoid adding a whole new notify-before config UI to
// the block editor just for this. Revisit if a fixed lead time proves too rigid in practice.
const SCHEDULE_NOTIFY_BEFORE_MIN = 30;

function scheduleOccurrenceTrigger(date: string, startTime: string, zone: string): Date {
  const start = zonedTimeToUtc(date, startTime, zone);
  return new Date(start.getTime() - SCHEDULE_NOTIFY_BEFORE_MIN * 60_000);
}

export function useNotificationChecker() {
  const tasks     = useTaskStore((s) => s.tasks);
  const events    = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const schedules = useScheduleStore((s) => s.schedules);
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const timezone    = useSettingsStore((s) => s.timezone);
  const { pending, addPending, removePending, markNotified, lastNotified } = useNotificationStore();

  useEffect(() => {
    const zone = resolveTimezone(timezone);
    const check = () => {
      const now = new Date();

      // ── Cleanup stale pending (deleted or completed/archived items) ──
      pending.forEach((n) => {
        if (n.kind === 'task-timed' || n.kind === 'task-untimed') {
          const t = tasks[n.itemId as import('@/types').TaskId];
          if (!t || t.completed || t.archived) removePending(n.id);
        } else if (n.kind === 'event') {
          if (!events[n.itemId as import('@/types').CalendarEventId]) removePending(n.id);
        } else if (n.kind === 'reminder') {
          if (!reminders[n.itemId as import('@/types').CalendarReminderId]) removePending(n.id);
        } else if (n.kind === 'schedule') {
          const [scheduleId, blockId, date] = n.itemId.split('::');
          const schedule = schedules[scheduleId as ScheduleId];
          const block = schedule?.blocks.find((b) => b.id === blockId);
          const stillCommitted = !!block?.requiresCommitment && (block.committedDates ?? []).includes(date);
          if (!schedule?.active || !stillCommitted) removePending(n.id);
        }
      });

      const isAlreadyPending = (itemId: string) => pending.some((n) => n.itemId === itemId);

      // Task deadlines no longer trigger notifications directly off the Task — every
      // deadline task now has a real shadow CalendarReminder (reminderType: 'task',
      // Task.calendarReminderId; see AddTaskModal/TaskPane), so the Reminders loop below
      // is the single source of deadline notifications too. Kept the linked task's
      // completed/archived state as a guard there (a shadow reminder is never deleted on
      // completion, matching how the deadline pill itself stays visible with completed
      // styling — only its notification needs to stop).
      const taskByDeadlineReminderId = new Map(
        Object.values(tasks)
          .filter((t) => t.calendarReminderId)
          .map((t) => [t.calendarReminderId as string, t] as const)
      );

      // ── Events ──
      Object.values(events).forEach((ev) => {
        if (isAlreadyPending(ev.id)) return;
        const trigger = eventTrigger(ev, zone);
        if (!trigger) return;
        const triggerISO = trigger.toISOString();
        const last = lastNotified(ev.id);
        if (trigger <= now && (!last || last < triggerISO)) {
          const body = ev.startTime ? `Starting at ${formatTime(ev.startTime, clockFormat)}` : allDayBody(ev.date, trigger, zone);
          addPending({ itemId: ev.id, kind: 'event', title: ev.title, body, triggeredAt: now.toISOString() });
          markNotified(ev.id, triggerISO);
          fireOSNotification(ev.title, body);
        }
      });

      // ── Reminders (includes task-deadline shadow reminders) ──
      Object.values(reminders).forEach((rem) => {
        if (isAlreadyPending(rem.id)) return;
        const isTaskDeadline = rem.reminderType === 'task';
        if (isTaskDeadline) {
          const linkedTask = taskByDeadlineReminderId.get(rem.id);
          if (!linkedTask || linkedTask.completed || linkedTask.archived) return;
        }
        const trigger = reminderTrigger(rem, zone);
        if (!trigger) return;
        const triggerISO = trigger.toISOString();
        const last = lastNotified(rem.id);
        if (trigger <= now && (!last || last < triggerISO)) {
          // Task-deadline shadow reminders keep the original "Due at/today" wording
          // (matching TaskItem's own deadline pill) rather than the generic "Reminder…".
          const when = rem.notifyDaysBefore === 0 ? 'today' : rem.notifyDaysBefore === 1 ? 'tomorrow' : `in ${rem.notifyDaysBefore} days`;
          const body = rem.time
            ? `${isTaskDeadline ? 'Due' : 'Reminder'} at ${formatTime(rem.time, clockFormat)}`
            : (isTaskDeadline ? `Due ${when}` : `Reminder ${when}`);
          addPending({ itemId: rem.id, kind: 'reminder', title: rem.title, body, triggeredAt: now.toISOString() });
          markNotified(rem.id, triggerISO);
          fireOSNotification(rem.title, body);
        }
      });

      // ── Committed Schedule occurrences (commitment mode only) ──
      // Each occurrence already has a stable, date-specific itemId (the same
      // `${scheduleId}::${blockId}::${date}` composite CalendarView renders with), so unlike
      // events/reminders there's no separate "which recurrence is this" problem to solve —
      // committing to a different date just produces a different itemId.
      Object.values(schedules).forEach((schedule) => {
        if (!schedule.active) return;
        schedule.blocks.forEach((block) => {
          if (!block.requiresCommitment) return;
          (block.committedDates ?? []).forEach((date) => {
            const itemId = `${schedule.id}::${block.id}::${date}`;
            if (isAlreadyPending(itemId)) return;
            const trigger = scheduleOccurrenceTrigger(date, block.startTime, zone);
            const triggerISO = trigger.toISOString();
            const last = lastNotified(itemId);
            if (trigger <= now && (!last || last < triggerISO)) {
              const body = `Committed — starting at ${formatTime(block.startTime, clockFormat)}`;
              addPending({ itemId, kind: 'schedule', title: block.title, body, triggeredAt: now.toISOString() });
              markNotified(itemId, triggerISO);
              fireOSNotification(block.title, body);
            }
          });
        });
      });
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, events, reminders, schedules, clockFormat, timezone]);
}
