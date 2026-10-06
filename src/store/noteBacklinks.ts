import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useListStore } from '@/store/listStore';
import { useListViews } from '@/store/listViews';
import { listView } from '@/services/listSecrets';
import type { List } from '@/types/lists';
import type { CrossAppRef } from '@/types';

export interface NoteBacklink {
  type:  'task' | 'event' | 'reminder' | 'deadline' | 'list';
  id:    string;
  title: string;
  done:  boolean;   // a completed task, or a reminder/deadline marked done — shown struck through
  tabId?: string;   // the note tab the link is about (CrossAppRef.tabId); absent = the whole note
}

const refTo = (refs: CrossAppRef[] | undefined, noteId: string) =>
  refs?.find((r) => r.type === 'note' && r.id === noteId);

// Everything that links to a note — the reverse half of every cross-app link (Task/Event/Reminder/List
// `crossAppRefs` naming this note), whichever side the link was made from. Derived on each change,
// never stored, so it can't disagree with the items themselves: deleting or unlinking on the other
// side updates it for free. Archived items are left out.
function collect(
  noteId: string,
  tasks: ReturnType<typeof useTaskStore.getState>['tasks'],
  events: ReturnType<typeof useCalendarStore.getState>['events'],
  reminders: ReturnType<typeof useCalendarStore.getState>['reminders'],
  deadlines: ReturnType<typeof useCalendarStore.getState>['deadlines'],
  lists: List[],   // views (listView), so an encrypted list shows its name, or the locked placeholder
): NoteBacklink[] {
  const out: NoteBacklink[] = [];
  for (const t of Object.values(tasks)) {
    const ref = t.archived ? undefined : refTo(t.crossAppRefs, noteId);
    if (ref) out.push({ type: 'task', id: t.id, title: t.title, done: t.completed, tabId: ref.tabId });
  }
  for (const e of Object.values(events)) {
    const ref = e.archivedAt ? undefined : refTo(e.crossAppRefs, noteId);
    if (ref) out.push({ type: 'event', id: e.id, title: e.title, done: false, tabId: ref.tabId });
  }
  for (const r of Object.values(reminders)) {
    const ref = r.archivedAt ? undefined : refTo(r.crossAppRefs, noteId);
    if (ref) out.push({ type: 'reminder', id: r.id, title: r.title, done: !r.repeat && r.doneDates.includes(r.date), tabId: ref.tabId });
  }
  for (const d of Object.values(deadlines)) {
    const ref = d.archivedAt ? undefined : refTo(d.crossAppRefs, noteId);
    if (ref) out.push({ type: 'deadline', id: d.id, title: d.title, done: !d.repeat && d.doneDates.includes(d.date), tabId: ref.tabId });
  }
  for (const l of lists) {
    const ref = refTo(l.crossAppRefs, noteId);
    if (ref) out.push({ type: 'list', id: l.id, title: l.name, done: false, tabId: ref.tabId });
  }
  return out;
}

// Same list, read once from the stores (for event handlers and timers, where a hook can't be used).
export function getNoteBacklinks(noteId: string): NoteBacklink[] {
  const cal = useCalendarStore.getState();
  return collect(noteId, useTaskStore.getState().tasks, cal.events, cal.reminders, cal.deadlines,
    Object.values(useListStore.getState().lists).map(listView));
}

export function useNoteBacklinks(noteId: string | null | undefined): NoteBacklink[] {
  const tasks     = useTaskStore((s) => s.tasks);
  const events    = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const lists     = useListViews();
  return useMemo(() => (noteId ? collect(noteId, tasks, events, reminders, deadlines, Object.values(lists)) : []), [noteId, tasks, events, reminders, deadlines, lists]);
}
