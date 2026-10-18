import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/utils/persistStorage';
import { now } from '@/utils/date';
import type { QuickAccessTargetType } from '@/store/recentItemsStore';

// What can be pinned to Quick Access (Q). Tasks, calendar items and schedules are left out on
// purpose (decided with the user 2026-10-18): they're short-lived or dated, so pins to them go
// stale. A new pinnable kind is a member here, a provider in utils/quickAccess.ts, and a pin
// action where the item is shown (CLAUDE.md "Pin to Quick Access").
export type PinnableType = Extract<QuickAccessTargetType, 'note' | 'notebook' | 'list' | 'endeavour' | 'tracker' | 'routine' | 'place' | 'glossary'>;

export const PINNABLE_TYPES: readonly PinnableType[] = ['note', 'notebook', 'list', 'endeavour', 'tracker', 'routine', 'place', 'glossary'];

export interface PinnedItem {
  // `${type}:${entityId}`, so one item is pinned once on every device. Places have the same ids
  // in every account, so the table is keyed by (user_id, id) (migration 053).
  id:        string;
  type:      PinnableType;
  entityId:  string;
  order:     number;
  createdAt: string;
  updatedAt: string;
}

export const pinKey = (type: PinnableType, entityId: string) => `${type}:${entityId}`;

interface PinnedItemsState {
  pins: Record<string, PinnedItem>;
  pin:     (type: PinnableType, entityId: string) => void;
  unpin:   (type: PinnableType, entityId: string) => void;
  // The pins' new order, as ids; ids not named keep their place after them.
  reorder: (ids: string[]) => void;
}

// Synced (`quick_access_pins`). Unpinning removes the pin outright: it's a reference to an item,
// not the item, so it doesn't go to the Recycling Bin (the Undo in the toast puts it back).
export const usePinnedItemsStore = create<PinnedItemsState>()(
  persist(
    (set) => ({
      pins: {},

      pin: (type, entityId) => set((s) => {
        const id = pinKey(type, entityId);
        if (s.pins[id]) return {};
        const order = Math.max(-1, ...Object.values(s.pins).map((p) => p.order)) + 1;
        const ts = now();
        return { pins: { ...s.pins, [id]: { id, type, entityId, order, createdAt: ts, updatedAt: ts } } };
      }),

      unpin: (type, entityId) => set((s) => {
        const id = pinKey(type, entityId);
        if (!s.pins[id]) return {};
        const pins = { ...s.pins };
        delete pins[id];
        return { pins };
      }),

      reorder: (ids) => set((s) => {
        const named = ids.filter((id) => s.pins[id]);
        const rest = Object.values(s.pins).filter((p) => !named.includes(p.id)).sort((a, b) => a.order - b.order).map((p) => p.id);
        const ts = now();
        const pins = { ...s.pins };
        [...named, ...rest].forEach((id, order) => {
          if (pins[id].order !== order) pins[id] = { ...pins[id], order, updatedAt: ts };
        });
        return { pins };
      }),
    }),
    { name: 'quick-access-pins', storage: persistStorage(), version: 1 },
  ),
);
