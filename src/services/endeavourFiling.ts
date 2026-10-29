import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { noteView } from '@/services/noteSecrets';
import { listView } from '@/services/listSecrets';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import type { CalendarDeadlineId, CalendarEventId, CalendarReminderId, CollectionId, GoalId, ScheduleId, TaskId } from '@/types';
import type { NoteId, NoteTagId, StructuredTagEntryId } from '@/types/notes';
import type { ListId } from '@/types/lists';

// Everything that can be filed under an Endeavour, in every app, in ONE registry
// (docs/features/endeavours.md phase 6): what's filed directly under one, and how to file it under
// another. Merging, splitting and copying an Endeavour go through it, so a new kind of thing that
// can be filed under an Endeavour is one entry here and every restructure covers it.

export type FiledKind =
  | 'task' | 'event' | 'reminder' | 'deadline' | 'note' | 'notebook' | 'glossary'
  | 'list' | 'timetable' | 'record' | 'goal';

export interface FiledItem { kind: FiledKind; id: string; title: string; endeavourId: string }

interface FiledKindDef {
  kind:  FiledKind;
  icon:  string;
  items: () => FiledItem[];
  // Files it under another Endeavour (or none). Things that follow it (a task's sub-tasks and its
  // own calendar entries) go with it.
  move:  (id: string, to: CollectionId | null) => void;
}

const item = (kind: FiledKind, id: string, title: string, endeavourId: string | null): FiledItem[] =>
  endeavourId ? [{ kind, id, title, endeavourId }] : [];

export const FILED_KINDS: FiledKindDef[] = [
  {
    // Top-level tasks: a sub-task goes with its task.
    kind: 'task', icon: ITEM_TYPE_ICON.task,
    items: () => Object.values(useTaskStore.getState().tasks).filter((t) => !t.parentId && !t.archived).flatMap((t) => item('task', t.id, t.title, t.collectionId)),
    move: (id, to) => {
      const tasks = useTaskStore.getState().tasks;
      const cal = useCalendarStore.getState();
      const moveOne = (tid: string) => {
        const t = tasks[tid as TaskId];
        if (!t) return;
        useTaskStore.getState().updateTask(t.id, { collectionId: to });
        if (t.calendarEventId && cal.events[t.calendarEventId]) cal.updateEvent(t.calendarEventId, { collectionId: to });
        if (t.calendarDeadlineId && cal.deadlines[t.calendarDeadlineId]) cal.updateDeadline(t.calendarDeadlineId, { collectionId: to });
        for (const sub of t.subtaskIds ?? []) moveOne(sub);
      };
      moveOne(id);
    },
  },
  {
    // A task's own scheduled event and Deadline are left to the task.
    kind: 'event', icon: ITEM_TYPE_ICON.event,
    items: () => Object.values(useCalendarStore.getState().events).filter((e) => e.eventType !== 'task' && !e.archivedAt).flatMap((e) => item('event', e.id, e.title, e.collectionId)),
    move: (id, to) => useCalendarStore.getState().updateEvent(id as CalendarEventId, { collectionId: to }),
  },
  {
    kind: 'reminder', icon: ITEM_TYPE_ICON.reminder,
    items: () => Object.values(useCalendarStore.getState().reminders).filter((r) => r.reminderType !== 'task' && !r.archivedAt).flatMap((r) => item('reminder', r.id, r.title, r.collectionId)),
    move: (id, to) => useCalendarStore.getState().updateReminder(id as CalendarReminderId, { collectionId: to }),
  },
  {
    kind: 'deadline', icon: ITEM_TYPE_ICON.deadline,
    items: () => Object.values(useCalendarStore.getState().deadlines).filter((d) => d.deadlineType !== 'task' && !d.archivedAt).flatMap((d) => item('deadline', d.id, d.title, d.collectionId)),
    move: (id, to) => useCalendarStore.getState().updateDeadline(id as CalendarDeadlineId, { collectionId: to }),
  },
  {
    // A note's own Endeavour (one it takes from its notebook moves with the notebook).
    kind: 'note', icon: ITEM_TYPE_ICON.note,
    items: () => Object.values(useNoteStore.getState().notes).flatMap((n) => item('note', n.id, noteView(n).title || LABELS.restructure.untitled, n.collectionId)),
    move: (id, to) => useNoteStore.getState().updateNote(id as NoteId, { collectionId: to }),
  },
  {
    kind: 'notebook', icon: '📓',
    items: () => Object.values(useNoteStore.getState().noteTags).filter((t) => t.kind === 'area').flatMap((t) => item('notebook', t.id, t.name, t.collectionId ?? null)),
    move: (id, to) => useNoteStore.getState().updateNoteTag(id as NoteTagId, { collectionId: to }),
  },
  {
    kind: 'glossary', icon: '📖',
    items: () => Object.values(useNoteStore.getState().structuredTagEntries).filter((e) => !e.isEncrypted).flatMap((e) => item('glossary', e.id, e.term || LABELS.restructure.untitled, e.collectionId ?? null)),
    move: (id, to) => useNoteStore.getState().updateStructuredTagEntry(id as StructuredTagEntryId, { collectionId: to }),
  },
  {
    kind: 'list', icon: ITEM_TYPE_ICON.list,
    items: () => Object.values(useListStore.getState().lists).flatMap((l) => item('list', l.id, listView(l).name, l.collectionId)),
    move: (id, to) => useListStore.getState().updateListLinks(id as ListId, { collectionId: to }),
  },
  {
    kind: 'timetable', icon: '🗓',
    items: () => Object.values(useScheduleStore.getState().schedules).flatMap((s) => item('timetable', s.id, s.name, s.collectionId)),
    move: (id, to) => useScheduleStore.getState().updateSchedule(id as ScheduleId, { collectionId: to }),
  },
  {
    // Trackers and routines (rhythms) filed under it.
    kind: 'record', icon: '📊',
    items: () => Object.values(useTaskStore.getState().collections).filter((c) => (c.kind === 'tracker' || c.kind === 'routine') && !c.archivedAt).flatMap((c) => item('record', c.id, c.name, c.collectionId)),
    move: (id, to) => useTaskStore.getState().updateCollection(id as CollectionId, { collectionId: to }),
  },
  {
    kind: 'goal', icon: '🎯',
    items: () => Object.values(useGoalStore.getState().goals).flatMap((g) => item('goal', g.id, g.title, g.target.type === 'endeavour' ? g.target.id : null)),
    move: (id, to) => { if (to) useGoalStore.getState().updateGoal(id as GoalId, { target: { type: 'endeavour', id: to } }); },
  },
];

const BY_KIND = Object.fromEntries(FILED_KINDS.map((k) => [k.kind, k])) as Record<FiledKind, FiledKindDef>;

export const filedIcon = (kind: FiledKind) => BY_KIND[kind].icon;

// What's filed directly under an Endeavour (not under its parts), by kind in registry order.
export function filedUnder(endeavourId: string): FiledItem[] {
  return FILED_KINDS.flatMap((k) => k.items().filter((i) => i.endeavourId === endeavourId));
}

// Files the given items under another Endeavour; returns how to put each back where it was.
export function moveFiled(items: readonly FiledItem[], to: CollectionId | null): () => void {
  for (const i of items) BY_KIND[i.kind].move(i.id, to);
  return () => { for (const i of items) BY_KIND[i.kind].move(i.id, i.endeavourId as CollectionId); };
}
