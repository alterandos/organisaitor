import { now } from '@/utils/date';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useFitnessStore } from '@/store/fitnessStore';
import { useTrashStore } from '@/store/trashStore';
import type { TrashEntryId, TrashableKind } from '@/types/trash';
import type { Task, Collection, Tag, Purpose, CalendarEvent, CalendarReminder, ScheduleTemplate, TrackerEntry } from '@/types';
import type { List, ListItem, ListType } from '@/types/lists';
import type { Note, NoteTag, StructuredTagEntry } from '@/types/notes';
import type { WatchlistItem, PortfolioTag, InvestmentPurpose } from '@/types/portfolio';
import type { Activity, ActivityType } from '@/types/fitness';

// The restore half of the suite-wide Recycling Bin (see services/trashCapture.ts for the
// write half, called from the stores). This file imports every domain store to write a
// restored snapshot back — it is imported ONLY by RecyclingBinPane, never by a store, so
// there's no import cycle (a domain store never needs to know how to restore anything).

interface RestoreTarget { has: (id: string) => boolean; put: (snapshot: unknown) => void }

const RESTORE_TARGETS: { [K in TrashableKind]: RestoreTarget } = {
  task: {
    has: (id) => id in useTaskStore.getState().tasks,
    put: (t) => useTaskStore.setState((s) => ({ tasks: { ...s.tasks, [(t as Task).id]: t as Task } })),
  },
  collection: {
    has: (id) => id in useTaskStore.getState().collections,
    put: (c) => useTaskStore.setState((s) => ({ collections: { ...s.collections, [(c as Collection).id]: c as Collection } })),
  },
  tag: {
    has: (id) => id in useTaskStore.getState().tags,
    put: (t) => useTaskStore.setState((s) => ({ tags: { ...s.tags, [(t as Tag).id]: t as Tag } })),
  },
  purpose: {
    has: (id) => id in useTaskStore.getState().purposes,
    put: (p) => useTaskStore.setState((s) => ({ purposes: { ...s.purposes, [(p as Purpose).id]: p as Purpose } })),
  },
  calendarEvent: {
    has: (id) => id in useCalendarStore.getState().events,
    put: (e) => useCalendarStore.setState((s) => ({ events: { ...s.events, [(e as CalendarEvent).id]: e as CalendarEvent } })),
  },
  calendarReminder: {
    has: (id) => id in useCalendarStore.getState().reminders,
    put: (r) => useCalendarStore.setState((s) => ({ reminders: { ...s.reminders, [(r as CalendarReminder).id]: r as CalendarReminder } })),
  },
  schedule: {
    has: (id) => id in useScheduleStore.getState().schedules,
    put: (sc) => useScheduleStore.setState((s) => ({ schedules: { ...s.schedules, [(sc as ScheduleTemplate).id]: sc as ScheduleTemplate } })),
  },
  trackerEntry: {
    has: (id) => id in useTrackerStore.getState().entries,
    put: (e) => useTrackerStore.setState((s) => ({ entries: { ...s.entries, [(e as TrackerEntry).id]: e as TrackerEntry } })),
  },
  list: {
    has: (id) => id in useListStore.getState().lists,
    put: (l) => useListStore.setState((s) => ({ lists: { ...s.lists, [(l as List).id]: l as List } })),
  },
  listItem: {
    has: (id) => id in useListStore.getState().listItems,
    put: (i) => useListStore.setState((s) => ({ listItems: { ...s.listItems, [(i as ListItem).id]: i as ListItem } })),
  },
  listType: {
    has: (id) => id in useListStore.getState().listTypes,
    put: (t) => useListStore.setState((s) => ({ listTypes: { ...s.listTypes, [(t as ListType).id]: t as ListType } })),
  },
  note: {
    has: (id) => id in useNoteStore.getState().notes,
    put: (n) => useNoteStore.setState((s) => ({ notes: { ...s.notes, [(n as Note).id]: n as Note } })),
  },
  noteTag: {
    has: (id) => id in useNoteStore.getState().noteTags,
    put: (t) => useNoteStore.setState((s) => ({ noteTags: { ...s.noteTags, [(t as NoteTag).id]: t as NoteTag } })),
  },
  structuredTagEntry: {
    has: (id) => id in useNoteStore.getState().structuredTagEntries,
    put: (e) => useNoteStore.setState((s) => ({ structuredTagEntries: { ...s.structuredTagEntries, [(e as StructuredTagEntry).id]: e as StructuredTagEntry } })),
  },
  watchlistItem: {
    has: (id) => id in usePortfolioStore.getState().watchlistItems,
    put: (i) => usePortfolioStore.setState((s) => ({ watchlistItems: { ...s.watchlistItems, [(i as WatchlistItem).id]: i as WatchlistItem } })),
  },
  portfolioTag: {
    has: (id) => id in usePortfolioStore.getState().portfolioTags,
    put: (t) => usePortfolioStore.setState((s) => ({ portfolioTags: { ...s.portfolioTags, [(t as PortfolioTag).id]: t as PortfolioTag } })),
  },
  investmentPurpose: {
    has: (id) => id in usePortfolioStore.getState().investmentPurposes,
    put: (p) => usePortfolioStore.setState((s) => ({ investmentPurposes: { ...s.investmentPurposes, [(p as InvestmentPurpose).id]: p as InvestmentPurpose } })),
  },
  activity: {
    has: (id) => id in useFitnessStore.getState().activities,
    put: (a) => useFitnessStore.setState((s) => ({ activities: { ...s.activities, [(a as Activity).id]: a as Activity } })),
  },
  activityType: {
    has: (id) => id in useFitnessStore.getState().activityTypes,
    put: (t) => useFitnessStore.setState((s) => ({ activityTypes: { ...s.activityTypes, [(t as ActivityType).id]: t as ActivityType } })),
  },
};

// Reinserts a trashed item's snapshot into its home store and forgets the trash entry.
// Returns false (a no-op) if the entry doesn't exist or something already occupies its id —
// restore must never overwrite live data.
export function restoreFromTrash(entryId: TrashEntryId): boolean {
  const entry = useTrashStore.getState().entries[entryId];
  if (!entry) return false;
  const snapshot = entry.snapshot as { id: string };
  const target = RESTORE_TARGETS[entry.kind];
  if (target.has(snapshot.id)) return false;

  target.put(entry.snapshot);

  // TaskList renders subtasks via the parent's subtaskIds array, not by filtering tasks for
  // parentId — deleteTask already stripped the id out of that array, so a restored task with
  // its old parentId still set would be invisible everywhere unless it's re-added here. If
  // the parent no longer exists (deleted, or itself still trashed), fall back to top-level.
  if (entry.kind === 'task') {
    const restored = entry.snapshot as Task;
    if (restored.parentId) {
      const parent = useTaskStore.getState().tasks[restored.parentId];
      if (parent) {
        useTaskStore.setState((s) => ({
          tasks: {
            ...s.tasks,
            [parent.id]: { ...parent, subtaskIds: [...(parent.subtaskIds ?? []), restored.id], updatedAt: now() },
          },
        }));
      } else {
        useTaskStore.setState((s) => ({
          tasks: { ...s.tasks, [restored.id]: { ...s.tasks[restored.id], parentId: null } },
        }));
      }
    }
  }

  useTrashStore.getState().removeEntry(entryId);
  return true;
}

// The entity is already gone from its domain store (it was removed at delete time) — this
// only forgets the trash record itself.
export function deleteForever(entryId: TrashEntryId): void {
  useTrashStore.getState().removeEntry(entryId);
}
