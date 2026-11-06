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
import { withItemRows } from '@/utils/scheduleItems';
import { commitOccurrence, createScheduleWithItems, saveScheduleRows, skipItemDate, unskipItemDate, uncommitDate } from '@/services/schedules';
import { useSettingsStore } from '@/store/settingsStore';
import { applyTemplate } from '@/services/endeavourTemplates';
import { saveSubjectItem } from '@/services/subjectItems';
import { setAttended } from '@/services/itemOccurrences';
import { planFromValues, type TemplateValues } from '@/config/endeavourTemplates';
import { DEFAULT_TEMPLATE_BY_ID } from '@/config/defaultTemplates';
import { useItemTypeStore } from '@/store/itemTypeStore';
import type { SubjectItemDraft } from '@/utils/subjectItems';
import { addTaskWithCalendar, updateTaskLinked, updateCalendarEventLinked } from '@/services/taskCalendarLinks';
import { spawnNextOccurrence } from '@/services/recurringTasks';
import { AgentError } from '@/agent/errors';
import { newTagId } from '@/utils/id';
import { resolveTimezone, todayIsoInZone } from '@/utils/timezone';
import type {
  CalendarEvent, CalendarEventId, CalendarReminder, CalendarReminderId, CalendarDeadline, CalendarDeadlineId, Collection, CollectionId,
  CreateCalendarEventInput, CreateCalendarReminderInput, CreateCalendarDeadlineInput, CreateCollectionInput, CreatePurposeInput,
  CreateScheduleInput, CreateTaskInput, ItemType, Purpose, PurposeId, ScheduleId, ScheduleTemplate, Tag, TagId,
  Task, TaskId,
} from '@/types';

const cal = () => useCalendarStore.getState();
const sched = () => useScheduleStore.getState();
const tasksState = () => useTaskStore.getState();

export type CalendarItemRef =
  | { kind: 'event';    item: CalendarEvent }
  | { kind: 'reminder'; item: CalendarReminder }
  | { kind: 'deadline'; item: CalendarDeadline };

export const read = {
  timezone: (): string => resolveTimezone(useSettingsStore.getState().timezone),
  today:    (): string => todayIsoInZone(resolveTimezone(useSettingsStore.getState().timezone)),

  tasks:    (): Task[] => Object.values(tasksState().tasks),
  task:     (id: string): Task | undefined => tasksState().tasks[id as TaskId],

  events:    (): CalendarEvent[] => Object.values(cal().events),
  event:     (id: string): CalendarEvent | undefined => cal().events[id as CalendarEventId],
  reminders: (): CalendarReminder[] => Object.values(cal().reminders),
  reminder:  (id: string): CalendarReminder | undefined => cal().reminders[id as CalendarReminderId],
  deadlines: (): CalendarDeadline[] => Object.values(cal().deadlines),
  deadline:  (id: string): CalendarDeadline | undefined => cal().deadlines[id as CalendarDeadlineId],
  calendarItem: (id: string): CalendarItemRef | undefined => {
    const item = read.event(id);
    if (item) return { kind: 'event', item };
    const reminder = read.reminder(id);
    if (reminder) return { kind: 'reminder', item: reminder };
    const deadline = read.deadline(id);
    return deadline ? { kind: 'deadline', item: deadline } : undefined;
  },

  // A Schedule's rows are its items (calendar events, phase 7 (c)); a row's id is its event's.
  schedules: (): ScheduleTemplate[] => Object.values(sched().schedules).map((s) => withItemRows(s, cal().events)),
  schedule:  (id: string): ScheduleTemplate | undefined => { const s = sched().schedules[id as ScheduleId]; return s && withItemRows(s, cal().events); },

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
  // Types (what kind of thing an item is: Lecture, Assessment…), for a subject's items.
  itemTypes:  (): ItemType[] => Object.values(useItemTypeStore.getState().types).filter((t) => !t.archivedAt),
};

type EventChanges = Partial<Omit<CalendarEvent, 'id' | 'createdAt'>>;
type ReminderChanges = Partial<Omit<CalendarReminder, 'id' | 'createdAt'>>;
type DeadlineChanges = Partial<Omit<CalendarDeadline, 'id' | 'createdAt'>>;
type CalendarItemKindForAgent = 'event' | 'reminder' | 'deadline';

export const write = {
  createTask:   (input: CreateTaskInput): TaskId => addTaskWithCalendar(input),
  updateTask:   (id: string, changes: Partial<Omit<Task, 'id' | 'createdAt'>>): void => updateTaskLinked(id as TaskId, changes),
  // A recurring task's next occurrence is made the same way as from the UI.
  toggleTask:   (id: string): void => {
    const wasDone = tasksState().tasks[id as TaskId]?.completed;
    tasksState().toggleTask(id as TaskId);
    if (wasDone === false) spawnNextOccurrence(id as TaskId);
  },
  archiveTask:  (id: string, reason?: string | null): void => tasksState().archiveTask(id as TaskId, reason),
  restoreTask:  (id: string): void => tasksState().restoreTask(id as TaskId),

  createEvent:      (input: CreateCalendarEventInput): CalendarEventId => cal().addEvent(input),
  createReminder:   (input: CreateCalendarReminderInput): CalendarReminderId => cal().addReminder(input),
  createDeadline:   (input: CreateCalendarDeadlineInput): CalendarDeadlineId => cal().addDeadline(input),
  updateEvent:      (id: string, changes: EventChanges): void => updateCalendarEventLinked(id as CalendarEventId, changes),
  updateReminder:   (id: string, changes: ReminderChanges): void => cal().updateReminder(id as CalendarReminderId, changes),
  updateDeadline:   (id: string, changes: DeadlineChanges): void => cal().updateDeadline(id as CalendarDeadlineId, changes),
  archiveEvent:     (id: string, reason?: string | null): void => cal().archiveEvent(id as CalendarEventId, reason),
  restoreEvent:     (id: string): void => cal().restoreEvent(id as CalendarEventId),
  archiveReminder:  (id: string, reason?: string | null): void => cal().archiveReminder(id as CalendarReminderId, reason),
  restoreReminder:  (id: string): void => cal().restoreReminder(id as CalendarReminderId),
  archiveDeadline:  (id: string, reason?: string | null): void => cal().archiveDeadline(id as CalendarDeadlineId, reason),
  restoreDeadline:  (id: string): void => cal().restoreDeadline(id as CalendarDeadlineId),

  skipOccurrence: (kind: CalendarItemKindForAgent, id: string, date: string): void => {
    if (kind === 'event') cal().skipEventOccurrence(id as CalendarEventId, date);
    else if (kind === 'reminder') cal().skipReminderOccurrence(id as CalendarReminderId, date);
    else cal().skipDeadlineOccurrence(id as CalendarDeadlineId, date);
  },
  // The store deletes the whole series when asked to end it on or before its first date. That is a
  // delete, so it is refused here rather than left to a command remembering to check.
  endSeriesBefore: (kind: CalendarItemKindForAgent, id: string, date: string): void => {
    const first = kind === 'event' ? read.event(id)?.date : kind === 'reminder' ? read.reminder(id)?.date : read.deadline(id)?.date;
    if (first !== undefined && date <= first) throw new AgentError('refused', 'That would end the series before its first date, which deletes it. Archive it instead.');
    if (kind === 'event') cal().endEventSeriesBefore(id as CalendarEventId, date);
    else if (kind === 'reminder') cal().endReminderSeriesBefore(id as CalendarReminderId, date);
    else cal().endDeadlineSeriesBefore(id as CalendarDeadlineId, date);
  },
  detachOccurrence: (kind: CalendarItemKindForAgent, id: string, date: string): string | null => {
    if (kind === 'event') return cal().detachEventOccurrence(id as CalendarEventId, date);
    if (kind === 'reminder') return cal().detachReminderOccurrence(id as CalendarReminderId, date);
    return cal().detachDeadlineOccurrence(id as CalendarDeadlineId, date);
  },
  splitSeries: (kind: CalendarItemKindForAgent, id: string, date: string): string | null => {
    if (kind === 'event') return cal().splitEventSeries(id as CalendarEventId, date);
    if (kind === 'reminder') return cal().splitReminderSeries(id as CalendarReminderId, date);
    return cal().splitDeadlineSeries(id as CalendarDeadlineId, date);
  },

  createSchedule:  (input: CreateScheduleInput): ScheduleId => createScheduleWithItems(input, input.blocks ?? []).id,
  updateSchedule:  (id: string, changes: Partial<Omit<ScheduleTemplate, 'id' | 'createdAt'>>): void => {
    const { blocks, ...rest } = changes;
    if (Object.keys(rest).length) sched().updateSchedule(id as ScheduleId, rest);
    if (blocks) saveScheduleRows(id as ScheduleId, blocks);
  },
  // A row's id is its item's (event) id.
  addException:    (_scheduleId: string, itemId: string, date: string): void => skipItemDate(itemId as CalendarEventId, date),
  removeException: (_scheduleId: string, itemId: string, date: string): void => unskipItemDate(itemId as CalendarEventId, date),
  commitOccurrences:  (_scheduleId: string, itemId: string, dates: string[]): void => { for (const d of dates) commitOccurrence(itemId as CalendarEventId, d); },
  uncommitOccurrence: (_scheduleId: string, itemId: string, date: string): void => uncommitDate(itemId as CalendarEventId, date),

  createEndeavour: (input: CreateCollectionInput): CollectionId => tasksState().addCollection(input),
  updateEndeavour: (id: string, changes: Parameters<ReturnType<typeof tasksState>['updateCollection']>[1]): void => tasksState().updateCollection(id as CollectionId, changes),
  createPurpose:   (input: CreatePurposeInput): PurposeId => tasksState().addPurpose(input),
  updatePurpose:   (id: string, changes: Parameters<ReturnType<typeof tasksState>['updatePurpose']>[1]): void => tasksState().updatePurpose(id as PurposeId, changes),
  // An Endeavour set up from a built-in template ('semester', 'subject'…: config/defaultTemplates.ts)
  // with the values given (config/endeavourTemplates.ts planFromValues); it remembers its template.
  applyTemplate: (templateId: string, values: TemplateValues, partOf: string | null): CollectionId => {
    if (!DEFAULT_TEMPLATE_BY_ID[templateId]) throw new AgentError('invalid', `No template "${templateId}".`);
    return applyTemplate(planFromValues(templateId, values), partOf as CollectionId | null).id;
  },
  // A subject's Schedule or Work item, made or changed as from its editor (services/subjectItems.ts).
  saveSubjectItem: (subjectId: string, draft: SubjectItemDraft, existing?: string): string | null => saveSubjectItem(subjectId as CollectionId, draft, existing),
  // One date of repeating Work done (or not), or of a class attended (or not), as the board marks it.
  markDate: (kind: 'work' | 'class', id: string, date: string, on: boolean): void => {
    if (kind === 'work') cal().setOccurrenceDone('deadline', id as CalendarDeadlineId, date, on);
    else setAttended(id as CalendarEventId, date, on);
  },
  createTag: (input: { name: string; color?: string | null; notes?: string | null }): TagId => {
    const id = newTagId();
    tasksState().addTag({ id, name: input.name.trim(), color: input.color ?? null, notes: input.notes ?? null });
    return id;
  },
};
