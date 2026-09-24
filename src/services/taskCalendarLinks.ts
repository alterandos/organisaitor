// A task's deadline and scheduled date each have a shadow calendar entry: a CalendarReminder
// (reminderType 'task') for the deadline and a CalendarEvent (eventType 'task') for the scheduled
// day. The task is the source of truth for the fields they share — title, date, time — and this
// is the one place that keeps the two sides matching. Every UI path that creates or edits a
// task's title/dates, or edits a task-linked event, goes through here instead of touching the
// shadows itself. Lives outside the stores for the same reason crossAppLinkCleanup does: it needs
// both taskStore and calendarStore.
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import type { CalendarEvent, CalendarEventId, CreateTaskInput, Task, TaskId } from '@/types';

const SHARED_TASK_FIELDS = ['title', 'deadline', 'deadlineTime', 'scheduledAt', 'scheduledTime'] as const;

export function syncScheduledShadow(taskId: TaskId): void {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task) return;
  const cal = useCalendarStore.getState();
  // A linked id whose event no longer exists counts as "no shadow", so the next edit recreates it.
  const event = task.calendarEventId ? cal.events[task.calendarEventId] : undefined;

  if (task.scheduledAt) {
    if (!event) {
      const id = cal.addEvent({ title: task.title, date: task.scheduledAt, startTime: task.scheduledTime, eventType: 'task' });
      useTaskStore.getState().updateTask(taskId, { calendarEventId: id });
    } else if (event.title !== task.title || event.date !== task.scheduledAt || (event.startTime ?? null) !== (task.scheduledTime ?? null)) {
      cal.updateEvent(event.id, { title: task.title, date: task.scheduledAt, startTime: task.scheduledTime ?? null });
    }
  } else if (task.calendarEventId) {
    if (event) cal.deleteEvent(event.id);
    useTaskStore.getState().updateTask(taskId, { calendarEventId: null });
  }
}

export function syncDeadlineShadow(taskId: TaskId): void {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task) return;
  const cal = useCalendarStore.getState();
  const reminder = task.calendarReminderId ? cal.reminders[task.calendarReminderId] : undefined;

  if (task.deadline) {
    if (!reminder) {
      const id = cal.addReminder({ title: task.title, date: task.deadline, time: task.deadlineTime, reminderType: 'task' });
      useTaskStore.getState().updateTask(taskId, { calendarReminderId: id });
    } else if (reminder.title !== task.title || reminder.date !== task.deadline || (reminder.time ?? null) !== (task.deadlineTime ?? null)) {
      cal.updateReminder(reminder.id, { title: task.title, date: task.deadline, time: task.deadlineTime ?? null });
    }
  } else if (task.calendarReminderId) {
    if (reminder) cal.deleteReminder(reminder.id);
    useTaskStore.getState().updateTask(taskId, { calendarReminderId: null });
  }
}

export function syncTaskShadows(taskId: TaskId): void {
  syncScheduledShadow(taskId);
  syncDeadlineShadow(taskId);
}

// A sub-task starts on its parent's priority, Endeavour, tags and purposes unless the caller
// says otherwise; for collectionId/tagIds/purposeIds, `undefined` means "inherit" and an
// explicit value (including `null`/`[]`) always wins — same convention for all three.
export function addTaskWithCalendar(input: CreateTaskInput): TaskId {
  const parent = input.parentId ? useTaskStore.getState().tasks[input.parentId] : undefined;
  const id = useTaskStore.getState().addTask({
    ...input,
    priority:     input.priority ?? parent?.priority,
    collectionId: input.collectionId === undefined ? parent?.collectionId : input.collectionId,
    tagIds:       input.tagIds === undefined ? parent?.tagIds : input.tagIds,
    purposeIds:   input.purposeIds === undefined ? parent?.purposeIds : input.purposeIds,
  });
  syncTaskShadows(id);
  return id;
}

export function updateTaskLinked(taskId: TaskId, changes: Partial<Omit<Task, 'id' | 'createdAt'>>): void {
  useTaskStore.getState().updateTask(taskId, changes);
  if (SHARED_TASK_FIELDS.some((f) => f in changes)) syncTaskShadows(taskId);
}

// Edits made on a task's scheduled event in the calendar pane flow back to the task; event-only
// fields (end time, location, tentative, notifications…) stay on the event.
export function updateCalendarEventLinked(eventId: CalendarEventId, changes: Partial<Omit<CalendarEvent, 'id' | 'createdAt'>>): void {
  useCalendarStore.getState().updateEvent(eventId, changes);

  const task = Object.values(useTaskStore.getState().tasks).find((t) => t.calendarEventId === eventId);
  if (!task) return;

  const patch: Partial<Pick<Task, 'title' | 'scheduledAt' | 'scheduledTime'>> = {};
  if (changes.title !== undefined && changes.title !== task.title) patch.title = changes.title;
  if (changes.date !== undefined && changes.date !== task.scheduledAt) patch.scheduledAt = changes.date;
  if (changes.startTime !== undefined && (changes.startTime ?? null) !== (task.scheduledTime ?? null)) patch.scheduledTime = changes.startTime;
  if (Object.keys(patch).length === 0) return;

  useTaskStore.getState().updateTask(task.id, patch);
  syncTaskShadows(task.id);
}
