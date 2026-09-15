import { useEffect } from 'react';
import type { CalendarEvent, CalendarReminder } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { fireOSNotification } from '@/services/notificationService';
import { formatTime } from '@/utils/date';
import { zonedTimeToUtc, resolveTimezone } from '@/utils/timezone';

function toMinutes(value: number, unit: 'minutes' | 'hours' | 'days'): number {
  if (unit === 'hours') return value * 60;
  if (unit === 'days') return value * 1440;
  return value;
}

function eventTrigger(event: CalendarEvent, zone: string): Date | null {
  if (event.remindAt) return new Date(event.remindAt);
  if (!event.startTime) return null;
  const start = zonedTimeToUtc(event.date, event.startTime, zone);
  const mins  = toMinutes(event.notifyBeforeValue, event.notifyBeforeUnit);
  return new Date(start.getTime() - mins * 60_000);
}

function reminderTrigger(rem: CalendarReminder, zone: string): Date | null {
  if (rem.remindAt) return new Date(rem.remindAt);
  if (!rem.time) return null;
  return zonedTimeToUtc(rem.date, rem.time, zone);
}

export function useNotificationChecker() {
  const tasks     = useTaskStore((s) => s.tasks);
  const events    = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
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
          const body = ev.startTime ? `Starting at ${formatTime(ev.startTime, clockFormat)}` : 'Today';
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
          const body = rem.time
            ? `${isTaskDeadline ? 'Due' : 'Reminder'} at ${formatTime(rem.time, clockFormat)}`
            : (isTaskDeadline ? 'Due today' : 'Reminder today');
          addPending({ itemId: rem.id, kind: 'reminder', title: rem.title, body, triggeredAt: now.toISOString() });
          markNotified(rem.id, triggerISO);
          fireOSNotification(rem.title, body);
        }
      });
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, events, reminders, clockFormat, timezone]);
}
