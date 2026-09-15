import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { rezoneWallClock } from '@/utils/timezone';
import type { Task, CalendarEvent, CalendarReminder } from '@/types';

// Re-stamps every stored wall-clock date+time so it keeps naming the same real-world instant
// after the app's effective timezone changes (e.g. a 2:00 PM New York event becomes an
// 11:00 AM Los Angeles event, not a relabelled 2:00 PM). Call this BEFORE committing the new
// zone to settingsStore — it needs the OLD zone to know what the existing times actually meant.
//
// All-day items (no time-of-day) are deliberately left untouched: a birthday on March 5 stays
// March 5 regardless of timezone, matching how Google Calendar treats all-day events too.
export function rezoneAllCalendarData(fromZone: string, toZone: string): void {
  if (fromZone === toZone) return;

  const { tasks, updateTask } = useTaskStore.getState();
  Object.values(tasks).forEach((task) => {
    const changes: Partial<Task> = {};
    if (task.deadline && task.deadlineTime) {
      const r = rezoneWallClock(task.deadline, task.deadlineTime, fromZone, toZone);
      changes.deadline     = r.date;
      changes.deadlineTime = r.time;
    }
    if (task.scheduledAt && task.scheduledTime) {
      const r = rezoneWallClock(task.scheduledAt, task.scheduledTime, fromZone, toZone);
      changes.scheduledAt   = r.date;
      changes.scheduledTime = r.time;
    }
    if (Object.keys(changes).length > 0) updateTask(task.id, changes);
  });

  const { events, updateEvent, reminders, updateReminder } = useCalendarStore.getState();
  Object.values(events).forEach((event) => {
    const changes: Partial<CalendarEvent> = {};
    if (event.startTime) {
      const r = rezoneWallClock(event.date, event.startTime, fromZone, toZone);
      changes.date      = r.date;
      changes.startTime = r.time;
    }
    if (event.endTime) {
      const r = rezoneWallClock(event.endDate ?? event.date, event.endTime, fromZone, toZone);
      changes.endDate  = r.date;
      changes.endTime  = r.time;
    }
    if (event.eventType === 'birthday' && event.notifyAtTime) {
      // Notify time-of-day only — the birthday's own date is all-day and must not shift.
      changes.notifyAtTime = rezoneWallClock(event.date, event.notifyAtTime, fromZone, toZone).time;
    }
    if (Object.keys(changes).length > 0) updateEvent(event.id, changes);
  });

  Object.values(reminders).forEach((reminder) => {
    if (!reminder.time) return;
    const r = rezoneWallClock(reminder.date, reminder.time, fromZone, toZone);
    const changes: Partial<CalendarReminder> = { date: r.date, time: r.time };
    updateReminder(reminder.id, changes);
  });
}
