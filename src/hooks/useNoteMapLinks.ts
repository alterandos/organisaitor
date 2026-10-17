import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useListViews } from '@/store/listViews';
import { buildNoteMap, type MapItemInput, type NoteMap } from '@/utils/noteMap';
import type { CrossAppRef } from '@/types';
import type { Note } from '@/types/notes';

// The links the Map draws over its blobs (CLAUDE.md "Notes views": a view reads stores only
// through hooks like this): how the notes link to each other, and, when asked, the tasks, events,
// reminders, deadlines and lists that link to them. With `focusNoteId`, its nodes are only what's
// within two links of that note ("around the open note").

const refsTo = (refs: CrossAppRef[] | undefined) => (refs ?? []).filter((r) => r.type === 'note').map((r) => r.id);

export function useNoteMapLinks(notes: Note[], includeItems: boolean, focusNoteId: string | null): NoteMap {
  const tasks = useTaskStore((s) => s.tasks);
  const events = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const lists = useListViews();

  const items = useMemo<MapItemInput[]>(() => {
    if (!includeItems) return [];
    const out: MapItemInput[] = [];
    for (const t of Object.values(tasks)) if (!t.archived) out.push({ type: 'task', id: t.id, title: t.title, done: t.completed, noteIds: refsTo(t.crossAppRefs) });
    for (const e of Object.values(events)) if (!e.archivedAt) out.push({ type: 'event', id: e.id, title: e.title, done: false, noteIds: refsTo(e.crossAppRefs) });
    for (const r of Object.values(reminders)) if (!r.archivedAt) out.push({ type: 'reminder', id: r.id, title: r.title, done: false, noteIds: refsTo(r.crossAppRefs) });
    for (const d of Object.values(deadlines)) if (!d.archivedAt) out.push({ type: 'deadline', id: d.id, title: d.title, done: false, noteIds: refsTo(d.crossAppRefs) });
    for (const l of Object.values(lists)) out.push({ type: 'list', id: l.id, title: l.name, done: false, noteIds: refsTo(l.crossAppRefs) });
    return out.filter((i) => i.noteIds.length > 0);
  }, [includeItems, tasks, events, reminders, deadlines, lists]);

  return useMemo(
    () => buildNoteMap(notes, items, { includeItems, focusNoteId, depth: 2, maxNodes: Number.POSITIVE_INFINITY }),
    [notes, items, includeItems, focusNoteId],
  );
}
