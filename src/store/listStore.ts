import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type {
  List, ListId, ListKind,
  ListItem, ListItemId,
  ListType, ListTypeId,
  ListTab, ListFieldSchema,
  CreateListInput, CreateListItemInput,
} from '@/types/lists';

// ── Built-in list type templates ──────────────────────────────────────────────
const BUILTIN_LIST_TYPES: ListType[] = [
  // ── Watchlist ──────────────────────────────────────────────────────────────
  {
    id: 'lt-movies' as ListTypeId,
    name: 'Movies', icon: '🎬', color: '#f97316', kind: 'watchlist', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-director', name: 'Director',            type: 'text'   },
      { id: 'lf-year',     name: 'Year',                type: 'number' },
      { id: 'lf-genre',    name: 'Genre',               type: 'text'   },
      { id: 'lf-rating',   name: 'My rating',           type: 'rating', max: 5 },
      { id: 'lf-source',   name: 'How I heard about it',type: 'text'   },
    ],
  },
  {
    id: 'lt-shows' as ListTypeId,
    name: 'TV Shows', icon: '📺', color: '#8b5cf6', kind: 'watchlist', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-platform', name: 'Platform',            type: 'text'   },
      { id: 'lf-genre',    name: 'Genre',               type: 'text'   },
      { id: 'lf-rating',   name: 'My rating',           type: 'rating', max: 5 },
      { id: 'lf-source',   name: 'How I heard about it',type: 'text'   },
    ],
  },
  {
    id: 'lt-books' as ListTypeId,
    name: 'Books', icon: '📚', color: '#10b981', kind: 'watchlist', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-author',   name: 'Author',              type: 'text'   },
      { id: 'lf-genre',    name: 'Genre',               type: 'text'   },
      { id: 'lf-rating',   name: 'My rating',           type: 'rating', max: 5 },
      { id: 'lf-source',   name: 'How I heard about it',type: 'text'   },
    ],
  },
  {
    id: 'lt-music' as ListTypeId,
    name: 'Music', icon: '🎵', color: '#ec4899', kind: 'watchlist', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-artist',   name: 'Artist',              type: 'text'   },
      { id: 'lf-genre',    name: 'Genre',               type: 'text'   },
      { id: 'lf-rating',   name: 'My rating',           type: 'rating', max: 5 },
      { id: 'lf-source',   name: 'How I heard about it',type: 'text'   },
    ],
  },
  {
    id: 'lt-games' as ListTypeId,
    name: 'Games', icon: '🎮', color: '#6366f1', kind: 'watchlist', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-platform', name: 'Platform',            type: 'text'   },
      { id: 'lf-genre',    name: 'Genre',               type: 'text'   },
      { id: 'lf-rating',   name: 'My rating',           type: 'rating', max: 5 },
      { id: 'lf-source',   name: 'How I heard about it',type: 'text'   },
    ],
  },
  {
    id: 'lt-places' as ListTypeId,
    name: 'Places', icon: '📍', color: '#ef4444', kind: 'watchlist', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-location', name: 'City / Country',      type: 'text'   },
      { id: 'lf-category', name: 'Category',            type: 'text'   },
      { id: 'lf-rating',   name: 'My rating',           type: 'rating', max: 5 },
      { id: 'lf-source',   name: 'How I heard about it',type: 'text'   },
    ],
  },

  // ── Reference ──────────────────────────────────────────────────────────────
  {
    id: 'lt-credentials' as ListTypeId,
    name: 'Credentials', icon: '🔑', color: '#f59e0b', kind: 'reference', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-service',  name: 'Service',             type: 'text',   required: true },
      { id: 'lf-url',      name: 'URL',                 type: 'url'    },
      { id: 'lf-username', name: 'Username / Email',    type: 'text'   },
      { id: 'lf-pwhint',   name: 'Password hint',       type: 'text'   },
    ],
  },
  {
    id: 'lt-memberships' as ListTypeId,
    name: 'Memberships', icon: '🪪', color: '#0891b2', kind: 'reference', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-org',      name: 'Organisation',        type: 'text',   required: true },
      { id: 'lf-memberid', name: 'Member ID',           type: 'text'   },
      { id: 'lf-tier',     name: 'Tier / Level',        type: 'text'   },
      { id: 'lf-expiry',   name: 'Expiry date',         type: 'date'   },
    ],
  },
  {
    id: 'lt-subscriptions' as ListTypeId,
    name: 'Subscriptions', icon: '💳', color: '#7c3aed', kind: 'reference', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-service',  name: 'Service',             type: 'text',   required: true },
      { id: 'lf-email',    name: 'Email used',          type: 'text'   },
      { id: 'lf-cost',     name: 'Monthly cost',        type: 'number' },
      { id: 'lf-billing',  name: 'Billing date',        type: 'text'   },
      { id: 'lf-active',   name: 'Active',              type: 'boolean'},
    ],
  },
  {
    id: 'lt-contacts' as ListTypeId,
    name: 'Contacts', icon: '👤', color: '#10b981', kind: 'reference', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-email',    name: 'Email',               type: 'text'   },
      { id: 'lf-phone',    name: 'Phone',               type: 'text'   },
      { id: 'lf-org',      name: 'Organisation',        type: 'text'   },
      { id: 'lf-role',     name: 'Role',                type: 'text'   },
    ],
  },
  {
    id: 'lt-research' as ListTypeId,
    name: 'Research', icon: '🔬', color: '#5b6ee1', kind: 'reference', isBuiltIn: true,
    defaultFields: [
      { id: 'lf-url',      name: 'URL',                 type: 'url'    },
      { id: 'lf-authors',  name: 'Authors',             type: 'text'   },
      { id: 'lf-field',    name: 'Field / Subject',     type: 'text'   },
      { id: 'lf-keypts',   name: 'Key points',          type: 'text'   },
    ],
  },
  {
    id: 'lt-custom' as ListTypeId,
    name: 'Custom', icon: '📋', color: '#64748b', kind: 'reference', isBuiltIn: true,
    defaultFields: [],
  },
];

const WATCHLIST_TYPE_IDS = new Set([
  'lt-movies', 'lt-shows', 'lt-books', 'lt-music', 'lt-games', 'lt-places',
]);

const toRecord = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map((x) => [x.id, x]));

// ── Store interface ───────────────────────────────────────────────────────────
interface ListState {
  lists:     Record<ListId,     List>;
  listItems: Record<ListItemId, ListItem>;
  listTypes: Record<ListTypeId, ListType>;

  addList:       (input: CreateListInput) => ListId;
  updateList:    (id: ListId, patch: Partial<Omit<List, 'id' | 'createdAt'>>) => void;
  deleteList:    (id: ListId) => void;
  removeListTab: (listId: ListId, tabId: string) => void;

  addListItem:    (input: CreateListItemInput) => ListItemId;
  updateListItem: (id: ListItemId, patch: Partial<Omit<ListItem, 'id' | 'listId' | 'createdAt'>>) => void;
  deleteListItem: (id: ListItemId) => void;

  // ListType CRUD — users can add custom types; built-ins are protected
  addListType:    (type: Omit<ListType, 'id' | 'isBuiltIn'>) => ListTypeId;
  updateListType: (id: ListTypeId, patch: Partial<Omit<ListType, 'id' | 'isBuiltIn'>>) => void;
  deleteListType: (id: ListTypeId) => void;
}

export const useListStore = create<ListState>()(
  persist(
    (set, get) => ({
      lists:     {},
      listItems: {},
      listTypes: toRecord(BUILTIN_LIST_TYPES) as Record<ListTypeId, ListType>,

      addList: (input) => {
        const now = new Date().toISOString();
        const id  = nanoid() as ListId;
        const typeKind: ListKind = input.typeId
          ? (get().listTypes[input.typeId]?.kind ?? 'reference')
          : 'reference';
        const list: List = {
          id,
          name:        input.name.trim(),
          description: input.description ?? null,
          typeId:      input.typeId      ?? null,
          kind:        input.kind        ?? typeKind,
          color:       input.color       ?? null,
          icon:        input.icon        ?? null,
          fieldSchema: input.fieldSchema ?? [],
          tabs:        input.tabs        ?? [],
          createdAt:   now,
          updatedAt:   now,
        };
        set((s) => ({ lists: { ...s.lists, [id]: list } }));
        return id;
      },

      updateList: (id, patch) => set((s) => {
        const existing = s.lists[id];
        if (!existing) return s;
        return { lists: { ...s.lists, [id]: { ...existing, ...patch, updatedAt: new Date().toISOString() } } };
      }),

      deleteList: (id) => set((s) => {
        const nextLists = { ...s.lists };
        delete nextLists[id];
        const nextItems = Object.fromEntries(
          Object.entries(s.listItems).filter(([, item]) => item.listId !== id)
        ) as Record<ListItemId, ListItem>;
        return { lists: nextLists, listItems: nextItems };
      }),

      addListItem: (input) => {
        const now  = new Date().toISOString();
        const id   = nanoid() as ListItemId;
        const itemsInList = Object.values(get().listItems).filter((i) => i.listId === input.listId);
        const item: ListItem = {
          id,
          listId: input.listId,
          title:  input.title.trim(),
          status: input.status ?? 'want',
          tabId:  input.tabId  ?? null,
          data:   input.data   ?? {},
          notes:  input.notes  ?? null,
          links:  input.links  ?? [],
          order:  input.order  ?? itemsInList.length,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ listItems: { ...s.listItems, [id]: item } }));
        return id;
      },

      updateListItem: (id, patch) => set((s) => {
        const existing = s.listItems[id];
        if (!existing) return s;
        return { listItems: { ...s.listItems, [id]: { ...existing, ...patch, updatedAt: new Date().toISOString() } } };
      }),

      deleteListItem: (id) => set((s) => {
        const next = { ...s.listItems };
        delete next[id];
        return { listItems: next };
      }),

      removeListTab: (listId, tabId) => set((s) => {
        const list = s.lists[listId];
        if (!list) return s;
        const tabs = list.tabs.filter((t) => t.id !== tabId);
        const listItems = Object.fromEntries(
          Object.entries(s.listItems).map(([id, item]) => [
            id,
            item.listId === listId && item.tabId === tabId
              ? { ...item, tabId: null }
              : item,
          ])
        ) as Record<ListItemId, ListItem>;
        return {
          lists: { ...s.lists, [listId]: { ...list, tabs, updatedAt: new Date().toISOString() } },
          listItems,
        };
      }),

      addListType: (type) => {
        const id = nanoid() as ListTypeId;
        set((s) => ({ listTypes: { ...s.listTypes, [id]: { ...type, id, isBuiltIn: false } } }));
        return id;
      },

      updateListType: (id, patch) => set((s) => {
        const existing = s.listTypes[id];
        if (!existing) return s;
        return { listTypes: { ...s.listTypes, [id]: { ...existing, ...patch } } };
      }),

      deleteListType: (id) => set((s) => {
        if (s.listTypes[id]?.isBuiltIn) return s;
        const next = { ...s.listTypes };
        delete next[id];
        return { listTypes: next };
      }),
    }),
    {
      name: 'lists-storage',
      version: 4,
      migrate: (persisted, fromVersion) => {
        let state = persisted as any;

        if (fromVersion < 2) {
          const userTypes = Object.fromEntries(
            Object.entries(state.listTypes ?? {}).filter(([, t]) => !(t as ListType).isBuiltIn)
          );
          const listTypes = { ...toRecord(BUILTIN_LIST_TYPES), ...userTypes };
          const lists = Object.fromEntries(
            Object.entries(state.lists ?? {}).map(([id, list]) => {
              const l = list as List & { kind?: ListKind };
              const kind: ListKind = l.kind ?? (l.typeId && WATCHLIST_TYPE_IDS.has(l.typeId) ? 'watchlist' : 'reference');
              return [id, { ...l, kind }];
            })
          );
          state = { ...state, listTypes, lists };
        }

        if (fromVersion < 3) {
          const lists = Object.fromEntries(
            Object.entries(state.lists ?? {}).map(([id, list]) => {
              const l = list as List & { tabs?: ListTab[] };
              return [id, { ...l, tabs: l.tabs ?? [] }];
            })
          );
          const listItems = Object.fromEntries(
            Object.entries(state.listItems ?? {}).map(([id, item]) => {
              const i = item as ListItem & { tabId?: string | null };
              return [id, { ...i, tabId: i.tabId ?? null }];
            })
          );
          state = { ...state, lists, listItems };
        }

        if (fromVersion < 4) {
          const lists = Object.fromEntries(
            Object.entries(state.lists ?? {}).map(([id, list]) => {
              const l = list as List;
              return [id, {
                ...l,
                tabs: (l.tabs ?? []).map((tab: ListTab & { fieldSchema?: ListFieldSchema[] }) => ({
                  ...tab,
                  fieldSchema: tab.fieldSchema ?? [],
                })),
              }];
            })
          );
          state = { ...state, lists };
        }

        return state;
      },
    },
  ),
);

export { BUILTIN_LIST_TYPES, WATCHLIST_TYPE_IDS };
export type { ListFieldSchema, ListTab };
