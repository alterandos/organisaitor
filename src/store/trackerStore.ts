import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrackerEntry, TrackerEntryId, CollectionId, CreateTrackerEntryInput } from '@/types';
import { newTrackerEntryId } from '@/utils/id';
import { now } from '@/utils/date';

interface TrackerState {
  entries: Record<TrackerEntryId, TrackerEntry>;

  addEntry:    (input: CreateTrackerEntryInput) => TrackerEntry;
  updateEntry: (id: TrackerEntryId, changes: Partial<Pick<TrackerEntry, 'date' | 'data' | 'notes'>>) => void;
  deleteEntry: (id: TrackerEntryId) => void;
  deleteEntriesForTracker: (trackerId: CollectionId) => void;
}

export const useTrackerStore = create<TrackerState>()(
  persist(
    (set) => ({
      entries: {} as Record<TrackerEntryId, TrackerEntry>,

      addEntry: (input) => {
        const ts = now();
        const entry: TrackerEntry = {
          id:        newTrackerEntryId(),
          trackerId: input.trackerId,
          date:      input.date,
          data:      input.data  ?? {},
          notes:     input.notes ?? null,
          createdAt: ts,
          updatedAt: ts,
        };
        set((state) => ({ entries: { ...state.entries, [entry.id]: entry } }));
        return entry;
      },

      updateEntry: (id, changes) =>
        set((state) => {
          const entry = state.entries[id];
          if (!entry) return {};
          return {
            entries: {
              ...state.entries,
              [id]: { ...entry, ...changes, updatedAt: now() },
            },
          };
        }),

      deleteEntry: (id) =>
        set((state) => {
          const entries = { ...state.entries };
          delete entries[id];
          return { entries };
        }),

      deleteEntriesForTracker: (trackerId) =>
        set((state) => ({
          entries: Object.fromEntries(
            Object.entries(state.entries).filter(([, e]) => e.trackerId !== trackerId)
          ) as Record<TrackerEntryId, TrackerEntry>,
        })),
    }),
    {
      name:    'todo-tracker',
      version: 1,
    }
  )
);
