import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Cross-app "navigable target" types the Quick Access pane (Ctrl+G) can jump to. Kept as its
// own small union here (not re-exported through types/index.ts) so new target types can be
// added by any app's provider (src/utils/quickAccess.ts) without a circular import — mirrors
// how src/types/notes.ts/lists.ts stay standalone. Extend this union + add a matching
// QuickAccessProvider when a new destination type is wanted (see quickAccess.ts).
export type QuickAccessTargetType = 'note' | 'notebook' | 'task' | 'list' | 'endeavour' | 'tracker' | 'routine';

export interface RecentItemEntry {
  type:          QuickAccessTargetType;
  entityId:      string;
  lastVisitedAt: string;   // ISO 8601
  visitCount:    number;
}

// Hygiene cap — this store persists indefinitely and nothing ever proactively removes an
// entry when its underlying entity is deleted (stale entries are instead lazily pruned by
// QuickAccessPane whenever a provider fails to resolve one). Left unbounded, it would grow
// forever; trimming to the most-relevant N on write keeps it bounded without needing that
// per-delete cleanup wiring across every entity store.
const MAX_ENTRIES = 500;
const TRIM_TO = 400;

function keyFor(type: QuickAccessTargetType, entityId: string): string {
  return `${type}:${entityId}`;
}

interface RecentItemsState {
  items: Record<string, RecentItemEntry>;
  recordVisit: (type: QuickAccessTargetType, entityId: string) => void;
  removeEntity: (type: QuickAccessTargetType, entityId: string) => void;
}

export const useRecentItemsStore = create<RecentItemsState>()(
  persist(
    (set) => ({
      items: {},

      recordVisit: (type, entityId) => set((s) => {
        const key = keyFor(type, entityId);
        const existing = s.items[key];
        let items: Record<string, RecentItemEntry> = {
          ...s.items,
          [key]: {
            type,
            entityId,
            lastVisitedAt: new Date().toISOString(),
            visitCount: (existing?.visitCount ?? 0) + 1,
          },
        };
        const keys = Object.keys(items);
        if (keys.length > MAX_ENTRIES) {
          const ordered = keys
            .map((k) => items[k])
            .sort((a, b) => new Date(b.lastVisitedAt).getTime() - new Date(a.lastVisitedAt).getTime())
            .slice(0, TRIM_TO);
          items = Object.fromEntries(ordered.map((e) => [keyFor(e.type, e.entityId), e]));
        }
        return { items };
      }),

      removeEntity: (type, entityId) => set((s) => {
        const key = keyFor(type, entityId);
        if (!(key in s.items)) return {};
        const items = { ...s.items };
        delete items[key];
        return { items };
      }),
    }),
    { name: 'todo-recent-items', version: 1 }
  )
);
