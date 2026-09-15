import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';

// Deadline tasks now get a real shadow CalendarReminder (Task.calendarReminderId,
// mirroring scheduledAt/calendarEventId — see AddTaskModal/TaskPane), and a scheduled
// task's shadow CalendarEvent now gets eventType: 'task' (drives the calendar layer
// toggle). Both are created going forward by AddTaskModal/TaskPane themselves, but
// pre-existing tasks need a one-time catch-up pass.
//
// Deliberately idempotent and run-every-mount rather than gated behind a "have I ever
// run this" flag: each check is a plain "does this task already have the link" test, so
// re-running is always a no-op for anything already linked. This also self-heals a
// cross-device sync edge case for free — a task pulled in from another device that
// hasn't backfilled it yet will simply get picked up here on this device's next reload,
// with no separate flag/version bookkeeping needed.
export function backfillTaskCalendarLinks(): void {
  const { tasks, updateTask } = useTaskStore.getState();
  const { events, addReminder, updateEvent } = useCalendarStore.getState();

  Object.values(tasks).forEach((task) => {
    if (task.deadline && !task.calendarReminderId) {
      const reminderId = addReminder({
        title:        task.title,
        date:         task.deadline,
        time:         task.deadlineTime ?? null,
        reminderType: 'task',
      });
      updateTask(task.id, { calendarReminderId: reminderId });
    }

    if (task.scheduledAt && task.calendarEventId) {
      const event = events[task.calendarEventId];
      if (event && event.eventType !== 'task') {
        updateEvent(task.calendarEventId, { eventType: 'task' });
      }
    }
  });
}
