// THE boundary between the agent's commands and the app's data. Commands (src/agent/commands/**)
// import nothing but this file, types and pure utils — an ESLint rule enforces it — so:
//   - what an agent can SEE is exactly what `read` returns. Anything that must stay hidden from it
//     (encrypted notes and lists, when those commands arrive) is dropped here, once.
//   - what an agent can DO is exactly what `write` exposes, and there is no delete in it: agents
//     archive, they never delete. Undoing an agent's own creations is `revertBatch`, a user action.
// Every write goes through the same store actions and services the UI uses, so the app's own
// invariants (sync stamps, task ⇄ calendar links, sub-task archiving…) hold for free.
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useSettingsStore } from '@/store/settingsStore';
import { addTaskWithCalendar, updateTaskLinked, updateCalendarEventLinked } from '@/services/taskCalendarLinks';
import { AgentError } from '@/agent/errors';
import { newTagId } from '@/utils/id';
import { resolveTimezone, todayIsoInZone } from '@/utils/timezone';
import type {
  CalendarEvent, CalendarEventId, CalendarReminder, CalendarReminderId, Collection, CollectionId,
  CreateCalendarEventInput, CreateCalendarReminderInput, CreateCollectionInput, CreatePurposeInput,
  CreateScheduleInput, CreateTaskInput, Purpose, PurposeId, ScheduleId, ScheduleTemplate, Tag, TagId,
  Task, TaskId,
} from '@/types';

const cal = () => useCalendarStore.getState();
const sched = () => useScheduleStore.getState();
const tasksState = () => useTaskStore.getState();

export type CalendarItemRef =
  | { kind: 'event';    item: CalendarEvent }
  | { kind: 'reminder'; item: CalendarReminder };

export const read = {
  timezone: (): string => resolveTimezone(useSettingsStore.getState().timezone),
  today:    (): string => todayIsoInZone(resolveTimezone(useSettingsStore.getState().timezone)),

  tasks:    (): Task[] => Object.values(tasksState().tasks),
  task:     (id: string): Task | undefined => tasksState().tasks[id as TaskId],

  events:    (): CalendarEvent[] => Object.values(cal().events),
  event:     (id: string): CalendarEvent | undefined => cal().events[id as CalendarEventId],
  reminders: (): CalendarReminder[] => Object.values(cal().reminders),
  reminder:  (id: string): CalendarReminder | undefined => cal().reminders[id as CalendarReminderId],
  calendarItem: (id: string): CalendarItemRef | undefined => {
    const item = read.event(id);
    if (item) return { kind: 'event', item };
    const reminder = read.reminder(id);
    return reminder ? { kind: 'reminder', item: reminder } : undefined;
  },

  schedules: (): ScheduleTemplate[] => Object.values(sched().schedules),
  schedule:  (id: string): ScheduleTemplate | undefined => sched().schedules[id as ScheduleId],

  // "Endeavour" means a project or list Endeavour. Trackers and routines are Collections too, but
  // they are Records, not something a task can be filed under.
  endeavours: (): Collection[] => Object.values(tasksState().collections).filter((c) => c.kind === 'project' || c.kind === 'list'),
  endeavour:  (id: string): Collection | undefined => {
    const c = tasksState().collections[id as CollectionId];
    return c && (c.kind === 'project' || c.kind === 'list') ? c : undefined;
  },
  purposes:   (): Purpose[] => Object.values(tasksState().purposes),
  purpose:    (id: string): Purpose | undefined => tasksState().purposes[id as PurposeId],
  tags:       (): Tag[] => Object.values(tasksState().tags),
  tag:        (id: string): Tag | undefined => tasksState().tags[id as TagId],
};

type EventChanges = Partial<Omit<CalendarEvent, 'id' | 'createdAt'>>;
type ReminderChanges = Partial<Omit<CalendarReminder, 'id' | 'createdAt'>>;

export const write = {
  createTask:   (input: CreateTaskInput): TaskId => addTaskWithCalendar(input),
  updateTask:   (id: string, changes: Partial<Omit<Task, 'id' | 'createdAt'>>): void => updateTaskLinked(id as TaskId, changes),
  toggleTask:   (id: string): void => tasksState().toggleTask(id as TaskId),
  archiveTask:  (id: string, reason?: string | null): void => tasksState().archiveTask(id as TaskId, reason),
  restoreTask:  (id: string): void => tasksState().restoreTask(id as TaskId),

  createEvent:      (input: CreateCalendarEventInput): CalendarEventId => cal().addEvent(input),
  createReminder:   (input: CreateCalendarReminderInput): CalendarReminderId => cal().addReminder(input),
  updateEvent:      (id: string, changes: EventChanges): void => updateCalendarEventLinked(id as CalendarEventId, changes),
  updateReminder:   (id: string, changes: ReminderChanges): void => cal().updateReminder(id as CalendarReminderId, changes),
  archiveEvent:     (id: string, reason?: string | null): void => cal().archiveEvent(id as CalendarEventId, reason),
  restoreEvent:     (id: string): void => cal().restoreEvent(id as CalendarEventId),
  archiveReminder:  (id: string, reason?: string | null): void => cal().archiveReminder(id as CalendarReminderId, reason),
  restoreReminder:  (id: string): void => cal().restoreReminder(id as CalendarReminderId),

  skipOccurrence: (kind: 'event' | 'reminder', id: string, date: string): void =>
    kind === 'event' ? cal().skipEventOccurrence(id as CalendarEventId, date) : cal().skipReminderOccurrence(id as CalendarReminderId, date),
  // The store deletes the whole series when asked to end it on or before its first date. That is a
  // delete, so it is refused here rather than left to a command remembering to check.
  endSeriesBefore: (kind: 'event' | 'reminder', id: string, date: string): void => {
    const first = kind === 'event' ? read.event(id)?.date : read.reminder(id)?.date;
    if (first !== undefined && date <= first) throw new AgentError('refused', 'That would end the series before its first date, which deletes it. Archive it instead.');
    if (kind === 'event') cal().endEventSeriesBefore(id as CalendarEventId, date);
    else cal().endReminderSeriesBefore(id as CalendarReminderId, date);
  },
  detachOccurrence: (kind: 'event' | 'reminder', id: string, date: string): string | null =>
    kind === 'event' ? cal().detachEventOccurrence(id as CalendarEventId, date) : cal().detachReminderOccurrence(id as CalendarReminderId, date),
  splitSeries: (kind: 'event' | 'reminder', id: string, date: string): string | null =>
    kind === 'event' ? cal().splitEventSeries(id as CalendarEventId, date) : cal().splitReminderSeries(id as CalendarReminderId, date),

  createSchedule:  (input: CreateScheduleInput): ScheduleId => sched().addSchedule(input),
  updateSchedule:  (id: string, changes: Partial<Omit<ScheduleTemplate, 'id' | 'createdAt'>>): void => sched().updateSchedule(id as ScheduleId, changes),
  addException:    (scheduleId: string, blockId: string, date: string): void => sched().addException(scheduleId as ScheduleId, blockId, date),
  removeException: (scheduleId: string, blockId: string, date: string): void => sched().removeException(scheduleId as ScheduleId, blockId, date),
  commitOccurrences:  (scheduleId: string, blockId: string, dates: string[]): void => sched().commitOccurrences(scheduleId as ScheduleId, blockId, dates),
  uncommitOccurrence: (scheduleId: string, blockId: string, date: string): void => sched().uncommitOccurrence(scheduleId as ScheduleId, blockId, date),

  createEndeavour: (input: CreateCollectionInput): CollectionId => tasksState().addCollection(input),
  updateEndeavour: (id: string, changes: Parameters<ReturnType<typeof tasksState>['updateCollection']>[1]): void => tasksState().updateCollection(id as CollectionId, changes),
  createPurpose:   (input: CreatePurposeInput): PurposeId => tasksState().addPurpose(input),
  updatePurpose:   (id: string, changes: Parameters<ReturnType<typeof tasksState>['updatePurpose']>[1]): void => tasksState().updatePurpose(id as PurposeId, changes),
  createTag: (input: { name: string; color?: string | null; notes?: string | null }): TagId => {
    const id = newTagId();
    tasksState().addTag({ id, name: input.name.trim(), color: input.color ?? null, notes: input.notes ?? null });
    return id;
  },
};
