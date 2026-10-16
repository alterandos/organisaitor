import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Picture, PictureId } from '@/types/pictures';
import { persistStorageIdb } from '@/utils/idbStorage';

// The picture library: the pictures themselves (compressed data URLs, so IndexedDB, not
// localStorage). Synced (`pictures`). Use it through services/pictures.ts, which decides
// encryption, reuse and what a delete takes with it.
//
// Deleting a picture does NOT go to the Recycling Bin (decided with the user 2026-10-17): the
// person chooses "delete everywhere" or "just from here" instead, which is the safeguard.

interface PictureState {
  pictures: Record<PictureId, Picture>;
  putPicture:    (p: Picture) => void;
  removePicture: (id: PictureId) => void;
}

export const usePictureStore = create<PictureState>()(
  persist(
    (set) => ({
      pictures: {},
      putPicture: (p) => set((s) => ({ pictures: { ...s.pictures, [p.id]: p } })),
      removePicture: (id) => set((s) => {
        if (!s.pictures[id]) return {};
        const rest = { ...s.pictures };
        delete rest[id];
        return { pictures: rest };
      }),
    }),
    {
      name: 'pictures-storage',
      storage: persistStorageIdb(),
      version: 2,
      partialize: (s) => ({ pictures: s.pictures }),
      // v2: `origin` (backdrop / note / card); every picture before it was a backdrop.
      migrate: (persisted: unknown, fromVersion: number) => {
        let state = persisted as { pictures?: Record<string, Omit<Picture, 'origin'> & { origin?: Picture['origin'] }> };
        if (fromVersion < 2) {
          state = {
            ...state,
            pictures: Object.fromEntries(Object.entries(state.pictures ?? {}).map(([id, p]) => [id, { ...p, origin: p.origin ?? 'backdrop' }])),
          };
        }
        return state as PictureState;
      },
    },
  ),
);
