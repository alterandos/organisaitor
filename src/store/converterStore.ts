import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { ConverterId, CustomConverter } from '@/types/converters';
import { now } from '@/utils/date';
import { persistStorage } from '@/utils/persistStorage';
import { moveToTrash } from '@/services/trashCapture';

// The person's own converters (types/converters.ts), synced (`converters`), and which converters
// were used last on this device (`recent`: a unit category's id or a converter's, local only), so
// the converters panel opens on what's used most.

interface ConverterState {
  converters: Record<ConverterId, CustomConverter>;
  recent:     string[];
  addConverter:    (input: Omit<CustomConverter, 'id' | 'createdAt' | 'updatedAt'>) => ConverterId;
  updateConverter: (id: ConverterId, changes: Partial<Omit<CustomConverter, 'id' | 'createdAt'>>) => void;
  deleteConverter: (id: ConverterId) => void;
  markUsed:        (key: string) => void;
}

export const useConverterStore = create<ConverterState>()(
  persist(
    (set) => ({
      converters: {},
      recent: [],

      addConverter: (input) => {
        const id = nanoid() as ConverterId;
        const ts = now();
        set((s) => ({ converters: { ...s.converters, [id]: { ...input, name: input.name.trim(), id, createdAt: ts, updatedAt: ts } } }));
        return id;
      },

      updateConverter: (id, changes) => set((s) => {
        const c = s.converters[id];
        if (!c) return {};
        return { converters: { ...s.converters, [id]: { ...c, ...changes, updatedAt: now() } } };
      }),

      deleteConverter: (id) => set((s) => {
        const { [id]: removed, ...rest } = s.converters;
        if (removed) moveToTrash('converter', removed);
        return { converters: rest as Record<ConverterId, CustomConverter>, recent: s.recent.filter((k) => k !== id) };
      }),

      markUsed: (key) => set((s) => ({ recent: [key, ...s.recent.filter((k) => k !== key)].slice(0, 12) })),
    }),
    {
      name: 'converters-storage',
      storage: persistStorage(),
      version: 1,
    },
  ),
);
