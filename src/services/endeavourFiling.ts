import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { useUIStore } from '@/store/uiStore';
import { noteView } from '@/services/noteSecrets';
import { listView } from '@/services/listSecrets';
import { deleteScheduleWithItems, moveSchedule } from '@/services/schedules';
import { deleteNoteWithCleanup, deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import type { CalendarDeadlineId, CalendarEventId, CalendarReminderId, CollectionId, GoalId, ScheduleId, TaskId } from '@/types';
import type { NoteId, NoteTagId, StructuredTagEntryId } from '@/types/notes';
import type { ListId } from '@/types/lists';
import { repeatSummary } from '@/services/recurringTasks';
import { scheduleItems } from '@/utils/scheduleItems';
import { formatDate } from '@/utils/date';

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
  // Deletes it, as deleting it anywhere else does (to the Recycling Bin): discarding an Endeavour
  // that was being made (the creator). Absent: it's only unfiled.
  remove?: (id: string) => void;
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
    remove: (id) => deleteTaskWithCleanup(id as TaskId),
  },
  {
    // A task's own scheduled event and Deadline are left to the task, a Schedule's items to it.
    kind: 'event', icon: ITEM_TYPE_ICON.event,
    items: () => Object.values(useCalendarStore.getState().events).filter((e) => e.eventType !== 'task' && !e.scheduleId && !e.archivedAt).flatMap((e) => item('event', e.id, e.title, e.collectionId)),
    move: (id, to) => useCalendarStore.getState().updateEvent(id as CalendarEventId, { collectionId: to }),
    remove: (id) => useCalendarStore.getState().deleteEvent(id as CalendarEventId),
  },
  {
    kind: 'reminder', icon: ITEM_TYPE_ICON.reminder,
    items: () => Object.values(useCalendarStore.getState().reminders).filter((r) => r.reminderType !== 'task' && !r.archivedAt).flatMap((r) => item('reminder', r.id, r.title, r.collectionId)),
    move: (id, to) => useCalendarStore.getState().updateReminder(id as CalendarReminderId, { collectionId: to }),
    remove: (id) => useCalendarStore.getState().deleteReminder(id as CalendarReminderId),
  },
  {
    kind: 'deadline', icon: ITEM_TYPE_ICON.deadline,
    items: () => Object.values(useCalendarStore.getState().deadlines).filter((d) => d.deadlineType !== 'task' && !d.archivedAt).flatMap((d) => item('deadline', d.id, d.title, d.collectionId)),
    move: (id, to) => useCalendarStore.getState().updateDeadline(id as CalendarDeadlineId, { collectionId: to }),
    remove: (id) => useCalendarStore.getState().deleteDeadline(id as CalendarDeadlineId),
  },
  {
    // A note's own Endeavour (one it takes from its notebook moves with the notebook).
    kind: 'note', icon: ITEM_TYPE_ICON.note,
    items: () => Object.values(useNoteStore.getState().notes).flatMap((n) => item('note', n.id, noteView(n).title || LABELS.restructure.untitled, n.collectionId)),
    move: (id, to) => useNoteStore.getState().updateNote(id as NoteId, { collectionId: to }),
    remove: (id) => deleteNoteWithCleanup(id as NoteId),
  },
  {
    kind: 'notebook', icon: '📓',
    items: () => Object.values(useNoteStore.getState().noteTags).filter((t) => t.kind === 'area').flatMap((t) => item('notebook', t.id, t.name, t.collectionId ?? null)),
    move: (id, to) => useNoteStore.getState().updateNoteTag(id as NoteTagId, { collectionId: to }),
    remove: (id) => useNoteStore.getState().deleteNoteTag(id as NoteTagId),
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
    remove: (id) => useListStore.getState().deleteList(id as ListId),
  },
  {
    kind: 'timetable', icon: '🗓',
    items: () => Object.values(useScheduleStore.getState().schedules).flatMap((s) => item('timetable', s.id, s.name, s.collectionId)),
    move: (id, to) => moveSchedule(id as ScheduleId, to),
    remove: (id) => deleteScheduleWithItems(id as ScheduleId),
  },
  {
    // Trackers and routines (rhythms) filed under it.
    kind: 'record', icon: '📊',
    items: () => Object.values(useTaskStore.getState().collections).filter((c) => (c.kind === 'tracker' || c.kind === 'routine') && !c.archivedAt).flatMap((c) => item('record', c.id, c.name, c.collectionId)),
    move: (id, to) => useTaskStore.getState().updateCollection(id as CollectionId, { collectionId: to }),
    remove: (id) => useTaskStore.getState().deleteCollection(id as CollectionId),
  },
  {
    kind: 'goal', icon: '🎯',
    items: () => Object.values(useGoalStore.getState().goals).flatMap((g) => item('goal', g.id, g.title, g.target.type === 'endeavour' ? g.target.id : null)),
    move: (id, to) => { if (to) useGoalStore.getState().updateGoal(id as GoalId, { target: { type: 'endeavour', id: to } }); },
    remove: (id) => useGoalStore.getState().deleteGoal(id as GoalId),
  },
];

const BY_KIND = Object.fromEntries(FILED_KINDS.map((k) => [k.kind, k])) as Record<FiledKind, FiledKindDef>;

export const filedIcon = (kind: FiledKind) => BY_KIND[kind].icon;

// What's filed directly under an Endeavour (not under its parts), by kind in registry order.
export function filedUnder(endeavourId: string): FiledItem[] {
  return FILED_KINDS.flatMap((k) => k.items().filter((i) => i.endeavourId === endeavourId));
}

// One plain line saying what a filed thing is and when (the user, 2026-11-04: each thing made
// should say what it is): "Deadline · Sun 8 Nov", "Event · Every week on Wed · 10:00", "List · 3 items".
const S = LABELS.endeavourPieces.summary;
const day = (iso: string) => formatDate(`${iso}T00:00:00`);
export function filedDetail(i: FiledItem): string {
  const cal = useCalendarStore.getState();
  const when = (date: string | null | undefined, time: string | null | undefined, repeat: Parameters<typeof repeatSummary>[0] | null | undefined) =>
    [repeat ? repeatSummary(repeat) : date ? day(date) : '', time ?? ''].filter(Boolean).join(' · ');
  const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');
  switch (i.kind) {
    case 'task': {
      const t = useTaskStore.getState().tasks[i.id as TaskId];
      return join(S.task, t?.completedAt ? S.done : '', t?.repeat ? repeatSummary(t.repeat) : '', t?.deadline ? S.due(day(t.deadline)) : '');
    }
    case 'event': { const e = cal.events[i.id as CalendarEventId]; return join(S.event, when(e?.date, e?.startTime, e?.repeat)); }
    case 'deadline': { const d = cal.deadlines[i.id as CalendarDeadlineId]; return join(S.deadline, when(d?.date, d?.time, d?.repeat)); }
    case 'reminder': { const r = cal.reminders[i.id as CalendarReminderId]; return join(S.reminder, when(r?.date, r?.time, r?.repeat)); }
    case 'notebook': {
      const n = Object.values(useNoteStore.getState().notes).filter((x) => x.tagIds.includes(i.id as NoteTagId)).length;
      return join(S.notebook, S.notes(n));
    }
    case 'list': {
      const n = Object.values(useListStore.getState().listItems).filter((x) => x.listId === i.id).length;
      return join(S.list, S.items(n));
    }
    case 'timetable': return join(S.timetable, S.classes(scheduleItems(i.id, cal.events).length));
    case 'record': return useTaskStore.getState().collections[i.id as CollectionId]?.kind === 'tracker' ? S.tracker : S.routine;
    case 'goal': { const g = useGoalStore.getState().goals[i.id as GoalId]; return join(S.goal, g?.by ? S.due(day(g.by)) : ''); }
    default: return '';
  }
}

// Opens one where it's edited (an Endeavour's "Everything in it" view): its pane, or its place.
export function openFiled(i: FiledItem): void {
  const ui = useUIStore.getState();
  switch (i.kind) {
    case 'task':      ui.openTaskPane(i.id); return;
    case 'event':     ui.openCalendarEventPane(i.id); return;
    case 'reminder':  ui.openCalendarReminderPane(i.id); return;
    case 'deadline':  ui.openCalendarDeadlinePane(i.id); return;
    case 'note':      ui.setActiveView('notes'); ui.openNote(i.id); return;
    case 'notebook':  ui.setActiveView('notes'); ui.setSelectedNoteTag(i.id as NoteTagId); return;
    case 'glossary':  ui.setActiveView('notes'); ui.setNotesView('glossary'); return;
    case 'list':      ui.requestListSelection(i.id); ui.setActiveView('lists'); return;
    case 'timetable': { const s = useScheduleStore.getState().schedules[i.id as ScheduleId]; if (s) ui.openEditSchedule(s); return; }
    case 'record': {
      const c = useTaskStore.getState().collections[i.id as CollectionId];
      if (c?.kind === 'tracker') ui.setActiveTracker(i.id); else ui.setActiveRoutine(i.id);
      ui.setActiveView('records');
      return;
    }
    case 'goal':      ui.openEditGoal(i.id as GoalId); return;
  }
}

// Deletes one (to the Recycling Bin), or unfiles it where it can't be deleted from here.
export function removeFiled(i: FiledItem): void {
  const def = BY_KIND[i.kind];
  if (def.remove) def.remove(i.id); else def.move(i.id, null);
}

// Files the given items under another Endeavour; returns how to put each back where it was.
export function moveFiled(items: readonly FiledItem[], to: CollectionId | null): () => void {
  for (const i of items) BY_KIND[i.kind].move(i.id, to);
  return () => { for (const i of items) BY_KIND[i.kind].move(i.id, i.endeavourId as CollectionId); };
}
