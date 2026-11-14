import type { EndeavourTemplateDef } from '@/types/templates';
import { useTemplateStore } from '@/store/templateStore';
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
import { useOverviewStore } from '@/store/overviewStore';
import { useConverterStore } from '@/store/converterStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useGoalStore } from '@/store/goalStore';
import { forgetLinksTo } from '@/services/crossAppLinkCleanup';
import type { CustomConverter } from '@/types/converters';
import type { Overview } from '@/types/overview';
import type { TrashEntry, TrashEntryId, TrashableKind } from '@/types/trash';
import type { Task, Collection, Tag, Purpose, CalendarEvent, CalendarReminder, CalendarDeadline, ScheduleTemplate, TrackerEntry, ItemType, Goal } from '@/types';
import type { List, ListItem, ListType } from '@/types/lists';
import type { Note, NoteTag, StructuredTagEntry } from '@/types/notes';
import type { WatchlistItem, PortfolioTag, InvestmentPurpose } from '@/types/portfolio';
import type { Activity, ActivityType } from '@/types/fitness';
import { signal } from '@/animations/signals';

// The restore half of the suite-wide Recycling Bin (see services/trashCapture.ts for the
// write half, called from the stores). This file imports every domain store to write a
// restored snapshot back, so it is never imported by a store or by trashCapture.ts (that would
// be an import cycle; a domain store never needs to know how to restore anything). UI and
// services may use it: RecyclingBinPane, and the Undo of a swipe-delete (services/undoableActions.ts).

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
  calendarDeadline: {
    has: (id) => id in useCalendarStore.getState().deadlines,
    put: (d) => useCalendarStore.setState((s) => ({ deadlines: { ...s.deadlines, [(d as CalendarDeadline).id]: d as CalendarDeadline } })),
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
  overview: {
    has: (id) => id in useOverviewStore.getState().overviews,
    put: (o) => useOverviewStore.setState((s) => ({ overviews: { ...s.overviews, [(o as Overview).id]: o as Overview } })),
  },
  converter: {
    has: (id) => id in useConverterStore.getState().converters,
    put: (c) => useConverterStore.setState((s) => ({ converters: { ...s.converters, [(c as CustomConverter).id]: c as CustomConverter } })),
  },
  itemType: {
    has: (id) => id in useItemTypeStore.getState().types,
    put: (t) => useItemTypeStore.setState((s) => ({ types: { ...s.types, [(t as ItemType).id]: t as ItemType } })),
  },
  goal: {
    has: (id) => id in useGoalStore.getState().goals,
    put: (g) => useGoalStore.setState((s) => ({ goals: { ...s.goals, [(g as Goal).id]: g as Goal } })),
  },
  endeavourTemplate: {
    has: (id) => id in useTemplateStore.getState().templates,
    put: (t) => useTemplateStore.setState((s) => ({ templates: { ...s.templates, [(t as EndeavourTemplateDef).id]: t as EndeavourTemplateDef } })),
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
  // Back where it was: it glows there (animations/signals.ts), from Undo and the Recycling Bin alike.
  signal('arrive', snapshot.id);

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

// Runs a delete and returns the ids of the Recycling Bin entries it created, oldest first. A
// cascade makes several (a task's sub-tasks and its calendar entries go with it), and an Undo
// has to bring back all of them, not just the item the user deleted.
export function trashedBy(run: () => void): TrashEntryId[] {
  const before = new Set(Object.keys(useTrashStore.getState().entries));
  run();
  return (Object.keys(useTrashStore.getState().entries) as TrashEntryId[]).filter((id) => !before.has(id));
}

// Restores what trashedBy reported, newest first: a cascade trashes children before their
// parent, so the parent is back before its sub-tasks look for it (restoreFromTrash re-attaches
// a sub-task only if its parent exists).
export function restoreAllFromTrash(entryIds: TrashEntryId[]): void {
  for (const id of [...entryIds].reverse()) restoreFromTrash(id);
}

// The entity is already gone from its domain store (it was removed at delete time), so this
// forgets the trash record and, since nothing can bring the item back now, every link to it
// (references, task links, linked text in notes: crossAppLinkCleanup.forgetLinksTo). Until then
// those links stayed, hidden, so a restore brought them back (agreed with the user 2026-11-10).
export function deleteForever(entryId: TrashEntryId): void {
  const entry = useTrashStore.getState().entries[entryId];
  if (!entry) return;
  useTrashStore.getState().removeEntry(entryId);
  forgetLinksTo(entry.kind, entry.snapshot);
}

// "Empty recycling bin": every entry deleted forever.
export function emptyTrash(): void {
  const entries = Object.values(useTrashStore.getState().entries);
  useTrashStore.getState().clear();
  for (const e of entries) forgetLinksTo(e.kind, e.snapshot);
}

// Bin entries another device took away (its soft-delete arrived in a sync load). That device
// either restored the item (it's back in its store after the same load) or deleted it forever,
// and then its links go here too: the other device's own cleanup can lose to a later edit made
// here, or couldn't reach a note that was locked there. Called by sync after it merges.
export function forgetLinksOfEntriesRemovedElsewhere(removed: TrashEntry[]): void {
  for (const e of removed) {
    const id = (e.snapshot as { id?: string } | null)?.id;
    if (!id || RESTORE_TARGETS[e.kind]?.has(id)) continue;
    forgetLinksTo(e.kind, e.snapshot);
  }
}
