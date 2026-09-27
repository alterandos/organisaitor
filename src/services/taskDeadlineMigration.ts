// One-time conversion of task-deadline shadows from CalendarReminder (reminderType: 'task') to
// CalendarDeadline (deadlineType: 'task') — see CLAUDE.md "Deadline calendar kind" (decided
// 2026-09-27: task deadlines now shadow as the new Deadline kind, not a Reminder). This can't
// be a normal zustand `persist` `migrate()` step: it needs to update TWO stores together
// (calendarStore — create the Deadline, remove the old Reminder — and taskStore — repoint
// Task.calendarDeadlineId, clear Task.calendarReminderId), and `migrate()` only ever sees its
// own store's persisted state.
//
// Deliberately state-driven, not a "have I run this" flag: it just converts every remaining
// reminderType:'task' Reminder it finds and is a no-op once none are left, so it's naturally
// idempotent and self-heals if a legacy reminder ever arrives later (e.g. synced down from a
// device that created it before this migration existed) — it'll be caught on this device's
// next launch, since this runs once per app startup (see App.tsx).
//
// The old Reminder is removed directly via setState, NOT calendarStore.deleteReminder() — that
// action records a Recycling Bin entry (moveToTrash), which would be actively confusing here
// ("why is my old deadline reminder in the trash?") for what is really the same logical item
// changing representation, not a user delete.
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';

export function migrateTaskDeadlineShadows(): void {
  const cal = useCalendarStore.getState();
  const legacyShadows = Object.values(cal.reminders).filter((r) => r.reminderType === 'task');
  if (legacyShadows.length === 0) return;

  const tasks = useTaskStore.getState().tasks;

  for (const reminder of legacyShadows) {
    const task = Object.values(tasks).find((t) => t.calendarReminderId === reminder.id);

    if (task) {
      const newId = useCalendarStore.getState().addDeadline({
        title: reminder.title,
        date: reminder.date,
        time: reminder.time,
        notes: reminder.notes,
        links: reminder.links,
        collectionId: reminder.collectionId,
        deadlineType: 'task',
        repeat: reminder.repeat,
        important: reminder.important,
        status: reminder.status,
        crossAppRefs: reminder.crossAppRefs,
        notifyDaysBefore: reminder.notifyDaysBefore,
        notifyAtTime: reminder.notifyAtTime,
      });
      useTaskStore.getState().updateTask(task.id, { calendarDeadlineId: newId, calendarReminderId: null });
    }
    // No matching task (orphaned shadow, e.g. the task was deleted without cleanup running for
    // some historical reason) — nothing to migrate it to; just drop it below along with the rest.

    useCalendarStore.setState((s) => {
      const reminders = { ...s.reminders };
      delete reminders[reminder.id];
      return { reminders };
    });
  }
}
