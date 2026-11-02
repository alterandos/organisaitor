import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/utils/persistStorage';

// Cross-app "navigable target" types the Quick Access pane (Ctrl+G) can jump to. Kept as its
// own small union here (not re-exported through types/index.ts) so new target types can be
// added by any app's provider (src/utils/quickAccess.ts) without a circular import — mirrors
// how src/types/notes.ts/lists.ts stay standalone. Extend this union + add a matching
// QuickAccessProvider when a new destination type is wanted (see quickAccess.ts).
// 'place' is a Places-row destination (config/places.ts), counted so the row orders by use; it
// isn't listed among the recent items. 'glossary' (a term) is searched, never recorded.
export type QuickAccessTargetType = 'note' | 'notebook' | 'task' | 'list' | 'endeavour' | 'tracker' | 'routine' | 'schedule' | 'place' | 'glossary';

export interface RecentItemEntry {
  type:          QuickAccessTargetType;
  entityId:      string;
  lastVisitedAt: string;   // ISO 8601: every visit, however short (Recent)
  visitCount:    number;   // visits that counted (see "What counts as a visit" below)
  visits?:       string[]; // when the last MAX_VISITS of those were, oldest first (Frequent)
}

// What counts as a visit (2026-11-01: Frequent followed every note arrowed past, every remount and
// every back/forward, counted forever, so it jumped about and didn't follow where time went):
//   - only once it's been in front for DWELL_MS: the next thing of the same type opened sooner
//     (arrowing down a list, passing through on the way somewhere) means this one didn't count;
//   - not again within REVISIT_MS of its last counted visit (back and forth between two notes);
//   - Frequent ranks by `frecency`: each visit worth half as much every HALF_LIFE_DAYS.
export const DWELL_MS = 5_000;
export const REVISIT_MS = 30 * 60_000;
const HALF_LIFE_DAYS = 14;
const MAX_VISITS = 20;

export function frecency(entry: RecentItemEntry, now = Date.now()): number {
  const visits = entry.visits ?? [];
  return visits.reduce((sum, at) => sum + 0.5 ** ((now - new Date(at).getTime()) / 86_400_000 / HALF_LIFE_DAYS), 0);
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

// The visit of each type still waiting out DWELL_MS: one per type, so opening a note (which also
// selects its notebook) doesn't cancel the notebook's.
const pending = new Map<QuickAccessTargetType, { key: string; timer: ReturnType<typeof setTimeout> }>();

interface RecentItemsState {
  items: Record<string, RecentItemEntry>;
  recordVisit: (type: QuickAccessTargetType, entityId: string) => void;
  countVisit: (key: string) => void;
  removeEntity: (type: QuickAccessTargetType, entityId: string) => void;
}

export const useRecentItemsStore = create<RecentItemsState>()(
  persist(
    (set, get) => ({
      items: {},

      recordVisit: (type, entityId) => {
        const key = keyFor(type, entityId);
        const was = pending.get(type);
        if (was) clearTimeout(was.timer);
        pending.set(type, { key, timer: setTimeout(() => { pending.delete(type); get().countVisit(key); }, DWELL_MS) });
        set((s) => {
          const existing = s.items[key];
          let items: Record<string, RecentItemEntry> = {
            ...s.items,
            [key]: { ...existing, visitCount: existing?.visitCount ?? 0, type, entityId, lastVisitedAt: new Date().toISOString() },
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
        });
      },

      countVisit: (key) => set((s) => {
        const entry = s.items[key];
        if (!entry) return {};
        const visits = entry.visits ?? [];
        const last = visits[visits.length - 1];
        const now = Date.now();
        if (last && now - new Date(last).getTime() < REVISIT_MS) return {};
        return { items: { ...s.items, [key]: { ...entry, visitCount: entry.visitCount + 1, visits: [...visits, new Date(now).toISOString()].slice(-MAX_VISITS) } } };
      }),

      removeEntity: (type, entityId) => set((s) => {
        const key = keyFor(type, entityId);
        if (!(key in s.items)) return {};
        const items = { ...s.items };
        delete items[key];
        return { items };
      }),
    }),
    {
      name: 'todo-recent-items', storage: persistStorage(), version: 2,
      // v2: `visits`. The old counts took in every pass through, so each keeps at most a few
      // visits, dated at its last.
      migrate: (persisted, fromVersion) => {
        let state = persisted as { items?: Record<string, RecentItemEntry> };
        if (fromVersion < 2) {
          const items = Object.fromEntries(Object.entries(state.items ?? {}).map(([k, e]) => {
            const n = Math.min(e.visitCount ?? 0, 3);
            return [k, { ...e, visitCount: n, visits: Array.from({ length: n }, () => e.lastVisitedAt) }];
          }));
          state = { ...state, items };
        }
        return state as RecentItemsState;
      },
    }
  )
);
