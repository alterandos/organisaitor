import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { ItemType, ItemTypeId } from '@/types';
import { now } from '@/utils/date';
import { persistStorage } from '@/utils/persistStorage';
import { moveToTrash } from '@/services/trashCapture';

// The person's Types (docs/features/endeavours.md phase 3), synced (`item_types`, migration 060).
// None are built in: a starter set is added only on request (config/typeStarters.ts). The rules are
// utils/itemTypes.ts; applying one to an item is services/itemTypes.ts.

export type ItemTypeInput = Omit<ItemType, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'> & { archivedAt?: string | null };

interface ItemTypeState {
  types: Record<ItemTypeId, ItemType>;
  addItemType:    (input: ItemTypeInput) => ItemTypeId;
  updateItemType: (id: ItemTypeId, changes: Partial<Omit<ItemType, 'id' | 'createdAt'>>) => void;
  deleteItemType: (id: ItemTypeId) => void;
}

export const useItemTypeStore = create<ItemTypeState>()(
  persist(
    (set) => ({
      types: {},

      addItemType: (input) => {
        const id = nanoid() as ItemTypeId;
        const ts = now();
        set((s) => ({ types: { ...s.types, [id]: { archivedAt: null, ...input, name: input.name.trim(), id, createdAt: ts, updatedAt: ts } } }));
        return id;
      },

      updateItemType: (id, changes) => set((s) => {
        const t = s.types[id];
        if (!t) return {};
        return { types: { ...s.types, [id]: { ...t, ...changes, updatedAt: now() } } };
      }),

      // Items of this Type keep their typeId and values (a missing Type is ignored where read), so
      // restoring it from the Recycling Bin brings them back as they were.
      deleteItemType: (id) => set((s) => {
        const { [id]: removed, ...rest } = s.types;
        if (removed) moveToTrash('itemType', removed);
        return { types: rest as Record<ItemTypeId, ItemType> };
      }),
    }),
    {
      name: 'item-types-storage',
      storage: persistStorage(),
      version: 1,
    },
  ),
);
