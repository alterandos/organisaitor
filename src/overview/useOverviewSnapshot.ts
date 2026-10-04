import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useNoteViews } from '@/store/noteViews';
import { useListViews, useListItemViews } from '@/store/listViews';
import { isNoteLocked } from '@/services/noteSecrets';
import { isListLocked } from '@/services/listSecrets';
import type { OverviewSnapshot } from './sources';

// Everything the Overview sources read, subscribed so the section re-renders when any app's data
// changes. Encrypted notes/lists come through their views (decrypted while the vault is unlocked);
// the locked ones are named so sources can leave them out.
export function useOverviewSnapshot(): OverviewSnapshot {
  const tasks       = useTaskStore((s) => s.tasks);
  const collections = useTaskStore((s) => s.collections);
  const events      = useCalendarStore((s) => s.events);
  const reminders   = useCalendarStore((s) => s.reminders);
  const deadlines   = useCalendarStore((s) => s.deadlines);
  const rawNotes    = useNoteStore((s) => s.notes);
  const noteTags    = useNoteStore((s) => s.noteTags);
  const rawLists    = useListStore((s) => s.lists);
  const entries     = useTrackerStore((s) => s.entries);
  const notes       = useNoteViews();
  const lists       = useListViews();
  const listItems   = useListItemViews();

  return useMemo(() => ({
    tasks, collections, events, reminders, deadlines, notes, noteTags, lists, listItems, entries,
    lockedNoteIds: new Set(Object.values(rawNotes).filter(isNoteLocked).map((n) => n.id)),
    lockedListIds: new Set(Object.values(rawLists).filter(isListLocked).map((l) => l.id)),
  }), [tasks, collections, events, reminders, deadlines, notes, noteTags, lists, listItems, entries, rawNotes, rawLists]);
}
