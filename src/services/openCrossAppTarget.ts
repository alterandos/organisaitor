import type { CalendarEventId, CalendarReminderId, TaskId } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';

// Opens the task / calendar event / calendar reminder a cross-app link points at, in its own
// section. Shared by clicking linked text in a note (ArtifactLinkMark) and clicking a "Linked
// from" pill. Returns false if the target no longer exists or isn't a supported type.
export function openArtifactTarget(targetType: string | null | undefined, targetId: string | null | undefined): boolean {
  if (!targetType || !targetId) return false;
  const ui = useUIStore.getState();
  if (targetType === 'task') {
    if (!useTaskStore.getState().tasks[targetId as TaskId]) return false;
    ui.setActiveView('tasks');
    ui.openTaskPane(targetId);
    return true;
  }
  const calendar = useCalendarStore.getState();
  if (targetType === 'event') {
    const event = calendar.events[targetId as CalendarEventId];
    if (!event) return false;
    ui.setActiveView('calendar');
    ui.requestCalendarDate(event.date);
    ui.openCalendarEventPane(targetId);
    return true;
  }
  if (targetType === 'reminder') {
    const reminder = calendar.reminders[targetId as CalendarReminderId];
    if (!reminder) return false;
    ui.setActiveView('calendar');
    ui.requestCalendarDate(reminder.date);
    ui.openCalendarReminderPane(targetId);
    return true;
  }
  return false;
}
