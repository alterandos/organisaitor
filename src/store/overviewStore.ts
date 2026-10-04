import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { Overview, OverviewId, OverviewQuery } from '@/types/overview';
import { now } from '@/utils/date';
import { persistStorage } from '@/utils/persistStorage';
import { moveToTrash } from '@/services/trashCapture';

// Saved (custom) Overviews — the definitions only; the rows are computed live from every app's
// source (src/overview/). The automatic per-Endeavour Overview isn't stored. Synced (`overviews`).

interface OverviewState {
  overviews: Record<OverviewId, Overview>;
  addOverview:    (input: { name: string; icon?: string | null } & OverviewQuery) => OverviewId;
  updateOverview: (id: OverviewId, changes: Partial<Omit<Overview, 'id' | 'createdAt'>>) => void;
  deleteOverview: (id: OverviewId) => void;
}

export const useOverviewStore = create<OverviewState>()(
  persist(
    (set) => ({
      overviews: {},

      addOverview: (input) => {
        const id = nanoid() as OverviewId;
        const ts = now();
        const overview: Overview = { ...input, id, name: input.name.trim(), icon: input.icon ?? null, createdAt: ts, updatedAt: ts };
        set((s) => ({ overviews: { ...s.overviews, [id]: overview } }));
        return id;
      },

      updateOverview: (id, changes) => set((s) => {
        const o = s.overviews[id];
        if (!o) return {};
        return { overviews: { ...s.overviews, [id]: { ...o, ...changes, updatedAt: now() } } };
      }),

      deleteOverview: (id) => set((s) => {
        const { [id]: removed, ...rest } = s.overviews;
        if (removed) moveToTrash('overview', removed);
        return { overviews: rest as Record<OverviewId, Overview> };
      }),
    }),
    {
      name: 'overviews-storage',
      storage: persistStorage(),
      version: 1,
    },
  ),
);
