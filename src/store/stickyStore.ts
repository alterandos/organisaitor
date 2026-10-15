import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/utils/persistStorage';

// Where each sticky note sits on this device's screen, and how it's drawn (services/stickyNotes.ts:
// a sticky note is an ordinary note in the Stickies notebook; this is only its place). Kept per
// device, not synced: screens differ. A sticky with no place yet gets one when it's first shown.

export const STICKY_DESIGNS = ['sticky', 'pin', 'staple', 'tape'] as const;
export type StickyDesign = typeof STICKY_DESIGNS[number];

export interface StickyPlace {
  x: number;              // left edge, as a fraction of the window's width
  y: number;              // top edge, as a fraction of the window's height
  design: StickyDesign;
}

interface StickyState {
  places: Record<string, StickyPlace>;
  setPlace:  (noteId: string, place: Partial<StickyPlace>) => void;
  forget:    (noteId: string) => void;
}

export const DEFAULT_STICKY_PLACE: StickyPlace = { x: 0.72, y: 0.14, design: 'sticky' };

export const useStickyStore = create<StickyState>()(
  persist(
    (set) => ({
      places: {},
      setPlace: (noteId, place) => set((s) => ({
        places: { ...s.places, [noteId]: { ...DEFAULT_STICKY_PLACE, ...s.places[noteId], ...place } },
      })),
      forget: (noteId) => set((s) => {
        if (!(noteId in s.places)) return {};
        const places = { ...s.places };
        delete places[noteId];
        return { places };
      }),
    }),
    { name: 'notes-stickies', storage: persistStorage(), version: 1 },
  ),
);
