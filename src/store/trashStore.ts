import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrashEntry, TrashEntryId } from '@/types/trash';
import { persistStorageIdb } from '@/utils/idbStorage';

interface TrashState {
  entries: Record<TrashEntryId, TrashEntry>;

  addEntry:    (entry: TrashEntry) => void;
  removeEntry: (id: TrashEntryId) => void;   // used by both restore (after reinsert) and delete-forever
  clear:       () => void;                    // "Empty recycling bin"
}

export const useTrashStore = create<TrashState>()(
  persist(
    (set) => ({
      entries: {},

      addEntry: (entry) =>
        set((state) => ({ entries: { ...state.entries, [entry.id]: entry } })),

      removeEntry: (id) =>
        set((state) => {
          const entries = { ...state.entries };
          delete entries[id];
          return { entries };
        }),

      clear: () => set({ entries: {} }),
    }),
    {
      // IndexedDB, not localStorage: trash snapshots include full copies of deleted notes
      // (same embedded-base64-image problem that forced noteStore onto IndexedDB — see
      // CLAUDE.md) plus an indefinitely-growing archive of every other deleted entity type
      // suite-wide (MVP has no auto-purge).
      name:    'trash-storage',
      storage: persistStorageIdb(),
      version: 1,
    }
  )
);
