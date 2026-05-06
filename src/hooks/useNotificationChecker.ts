import { useEffect } from 'react';
import type { Task, CalendarEvent, CalendarReminder } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNotificationStore } from '@/store/notificationStore';
import { fireOSNotification } from '@/services/notificationService';
import { formatTime } from '@/utils/date';

function toMinutes(value: number, unit: 'minutes' | 'hours' | 'days'): number {
  if (unit === 'hours') return value * 60;
  if (unit === 'days') return value * 1440;
  return value;
}

function taskTrigger(task: Task): Date | null {
  if (task.completed || task.archived) return null;
  if (task.remindAt) return new Date(task.remindAt);
  if (!task.deadline) return null;
  if (task.deadlineTime) return new Date(`${task.deadline}T${task.deadlineTime}`);
  return new Date(`${task.deadline}T09:00`);
}

function eventTrigger(event: CalendarEvent): Date | null {
  if (event.remindAt) return new Date(event.remindAt);
  if (!event.startTime) return null;
  const start = new Date(`${event.date}T${event.startTime}`);
  const mins  = toMinutes(event.notifyBeforeValue, event.notifyBeforeUnit);
  return new Date(start.getTime() - mins * 60_000);
}

function reminderTrigger(rem: CalendarReminder): Date | null {
  if (rem.remindAt) return new Date(rem.remindAt);
  if (!rem.time) return null;
  return new Date(`${rem.date}T${rem.time}`);
}

export function useNotificationChecker() {
  const tasks     = useTaskStore((s) => s.tasks);
  const events    = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const { pending, addPending, removePending, markNotified, lastNotified } = useNotificationStore();

  useEffect(() => {
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

      // ── Tasks ──
      Object.values(tasks).forEach((task) => {
        if (isAlreadyPending(task.id)) return;
        const trigger = taskTrigger(task);
        if (!trigger) return;
        const triggerISO = trigger.toISOString();
        const last = lastNotified(task.id);
        if (trigger <= now && (!last || last < triggerISO)) {
          const hasTimed = !!task.deadlineTime || !!task.remindAt;
          const body = hasTimed && task.deadlineTime
            ? `Due at ${formatTime(task.deadlineTime)}`
            : 'Due today';
          addPending({ itemId: task.id, kind: hasTimed ? 'task-timed' : 'task-untimed', title: task.title, body, triggeredAt: now.toISOString() });
          markNotified(task.id, triggerISO);
          fireOSNotification(task.title, body);
        }
      });

      // ── Events ──
      Object.values(events).forEach((ev) => {
        if (isAlreadyPending(ev.id)) return;
        const trigger = eventTrigger(ev);
        if (!trigger) return;
        const triggerISO = trigger.toISOString();
        const last = lastNotified(ev.id);
        if (trigger <= now && (!last || last < triggerISO)) {
          const body = ev.startTime ? `Starting at ${formatTime(ev.startTime)}` : 'Today';
          addPending({ itemId: ev.id, kind: 'event', title: ev.title, body, triggeredAt: now.toISOString() });
          markNotified(ev.id, triggerISO);
          fireOSNotification(ev.title, body);
        }
      });

      // ── Reminders ──
      Object.values(reminders).forEach((rem) => {
        if (isAlreadyPending(rem.id)) return;
        const trigger = reminderTrigger(rem);
        if (!trigger) return;
        const triggerISO = trigger.toISOString();
        const last = lastNotified(rem.id);
        if (trigger <= now && (!last || last < triggerISO)) {
          const body = rem.time ? `Reminder at ${formatTime(rem.time)}` : 'Reminder today';
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
  }, [tasks, events, reminders]);
}
