import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import type { CrossAppRef } from '@/types';

export interface NoteBacklink {
  type:  'task' | 'event' | 'reminder';
  id:    string;
  title: string;
  done:  boolean;   // a completed task — shown struck through
  tabId?: string;   // the note tab the link is about (CrossAppRef.tabId); absent = the whole note
}

const refTo = (refs: CrossAppRef[] | undefined, noteId: string) =>
  refs?.find((r) => r.type === 'note' && r.id === noteId);

// Everything that links to a note — the reverse half of every cross-app link (Task/Event/Reminder
// `crossAppRefs` naming this note), whichever side the link was made from. Derived on each change,
// never stored, so it can't disagree with the items themselves: deleting or unlinking on the other
// side updates it for free. Archived items are left out.
function collect(
  noteId: string,
  tasks: ReturnType<typeof useTaskStore.getState>['tasks'],
  events: ReturnType<typeof useCalendarStore.getState>['events'],
  reminders: ReturnType<typeof useCalendarStore.getState>['reminders'],
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
    if (ref) out.push({ type: 'reminder', id: r.id, title: r.title, done: false, tabId: ref.tabId });
  }
  return out;
}

// Same list, read once from the stores (for event handlers and timers, where a hook can't be used).
export function getNoteBacklinks(noteId: string): NoteBacklink[] {
  return collect(noteId, useTaskStore.getState().tasks, useCalendarStore.getState().events, useCalendarStore.getState().reminders);
}

export function useNoteBacklinks(noteId: string | null | undefined): NoteBacklink[] {
  const tasks     = useTaskStore((s) => s.tasks);
  const events    = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  return useMemo(() => (noteId ? collect(noteId, tasks, events, reminders) : []), [noteId, tasks, events, reminders]);
}
