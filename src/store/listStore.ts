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
import { encryptSecrets, decryptSecrets, queueEncrypt } from '@/services/noteSecrets';
import { persistStorage } from '@/utils/persistStorage';
import {
  extractListSecrets, blankListSecrets, extractItemSecrets, blankItemSecrets,
  putListSecrets, putItemSecrets, dropListSecrets, dropItemSecrets,
  isListLocked, isItemLocked, listView, itemView,
  type ListSecrets, type ItemSecrets,
} from '@/services/listSecrets';

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

  // Encryption (see src/services/listSecrets.ts). encryptList needs the vault UNLOCKED (rejects
  // otherwise); decryptList also needs the list's plaintext available (rejects if locked). Both
  // convert the list's items along with it.
  encryptList: (id: ListId) => Promise<void>;
  decryptList: (id: ListId) => Promise<void>;

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

      encryptList: (id) => encryptListImpl(id),
      decryptList: (id) => decryptListImpl(id),

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
          isEncrypted:      false,
          encryptedPayload: null,
          createdAt:   now,
          updatedAt:   now,
        };
        set((s) => ({ lists: { ...s.lists, [id]: list } }));
        return id;
      },

      updateList: (id, patch) => editList(id, (l) => ({ ...l, ...patch })),

      deleteList: (id) => {
        dropListSecrets(id);
        for (const i of Object.values(get().listItems)) if (i.listId === id) dropItemSecrets(i.id);
        set((s) => {
          const nextLists = { ...s.lists };
          delete nextLists[id];
          const nextItems = Object.fromEntries(
            Object.entries(s.listItems).filter(([, item]) => item.listId !== id)
          ) as Record<ListItemId, ListItem>;
          return { lists: nextLists, listItems: nextItems };
        });
      },

      addListItem: (input) => {
        const now  = new Date().toISOString();
        const id   = nanoid() as ListItemId;
        const parent = get().lists[input.listId];
        if (parent?.isEncrypted && isListLocked(parent)) {
          console.warn('[listStore] refused to add an item to a locked encrypted list:', input.listId);
          return '' as ListItemId;
        }
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
          isEncrypted:      false,
          encryptedPayload: null,
          createdAt: now,
          updatedAt: now,
        };
        if (parent?.isEncrypted) {
          // Born encrypted: an item added to an encrypted list must never sit in plaintext in the
          // store. Store the blanked form now; the first payload lands from the queue.
          const secrets = extractItemSecrets(item);
          putItemSecrets(id, secrets, null, true);
          set((s) => ({ listItems: { ...s.listItems, [id]: { ...blankItemSecrets(item), isEncrypted: true } } }));
          queueEncrypt(`item:${id}`, secrets, (payload) => landItemPayload(id, secrets, payload));
          return id;
        }
        set((s) => ({ listItems: { ...s.listItems, [id]: item } }));
        return id;
      },

      updateListItem: (id, patch) => editItem(id, (i) => ({ ...i, ...patch })),

      deleteListItem: (id) => {
        dropItemSecrets(id);
        set((s) => {
          const next = { ...s.listItems };
          delete next[id];
          return { listItems: next };
        });
      },

      removeListTab: (listId, tabId) => {
        const raw = get().lists[listId];
        if (!raw) return;
        if (raw.isEncrypted && isListLocked(raw)) {
          console.warn('[listStore] ignored a tab removal on a locked encrypted list:', listId);
          return;
        }
        // Tab NAMES live in the (possibly encrypted) list; items' tabId is plaintext structure.
        editList(listId, (l) => ({ ...l, tabs: l.tabs.filter((t) => t.id !== tabId) }));
        set((s) => ({
          listItems: Object.fromEntries(
            Object.entries(s.listItems).map(([id, item]) => [
              id,
              item.listId === listId && item.tabId === tabId ? { ...item, tabId: null } : item,
            ])
          ) as Record<ListItemId, ListItem>,
        }));
      },

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
      storage: persistStorage(),
      version: 5,
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

        if (fromVersion < 5) {
          const lists = Object.fromEntries(
            Object.entries(state.lists ?? {}).map(([id, list]) => [
              id, { isEncrypted: false, encryptedPayload: null, ...(list as object) },
            ])
          );
          const listItems = Object.fromEntries(
            Object.entries(state.listItems ?? {}).map(([id, item]) => [
              id, { isEncrypted: false, encryptedPayload: null, ...(item as object) },
            ])
          );
          state = { ...state, lists, listItems };
        }

        return state;
      },
    },
  ),
);

// ── Encryption-aware mutation helpers ────────────────────────────────────────
// Same shape as noteStore's (see services/listSecrets.ts for the model). Module-level so the
// actions above can reference them lazily; they read/write through useListStore.

type ListMap = Record<ListId, List>;
type ItemMap = Record<ListItemId, ListItem>;
const now = () => new Date().toISOString();

const putList = (id: ListId, list: List) =>
  useListStore.setState((s) => ({ lists: { ...s.lists, [id]: list } as ListMap }));
const putItem = (id: ListItemId, item: ListItem) =>
  useListStore.setState((s) => ({ listItems: { ...s.listItems, [id]: item } as ItemMap }));

const itemsOfList = (listId: ListId) =>
  Object.values(useListStore.getState().listItems).filter((i) => i.listId === listId);

// Apply `edit` — written against the READABLE (plaintext) form — to list `id`. Plain list: a
// normal update. Encrypted list: applied to the cached plaintext immediately, re-encrypted in
// the background; an edit to a LOCKED encrypted list is refused rather than corrupting it.
function editList(id: ListId, edit: (l: List) => List): void {
  const raw = useListStore.getState().lists[id];
  if (!raw) return;
  if (!raw.isEncrypted) {
    putList(id, { ...edit(raw), updatedAt: now() });
    return;
  }
  if (isListLocked(raw)) {
    console.warn('[listStore] ignored an edit to a locked encrypted list:', id);
    return;
  }
  const edited = edit(listView(raw));
  const secrets = extractListSecrets(edited);
  putListSecrets(id, secrets, raw.encryptedPayload, true);
  putList(id, { ...blankListSecrets(edited), isEncrypted: true, encryptedPayload: raw.encryptedPayload, updatedAt: now() });
  queueEncrypt(`list:${id}`, secrets, (payload) => landListPayload(id, secrets, payload));
}

// Store first, cache second (the cache entry is `dirty` until the second step, so no "locked" flash).
function landListPayload(id: ListId, secrets: ListSecrets, payload: string): void {
  const cur = useListStore.getState().lists[id];
  if (!cur || !cur.isEncrypted) return; // deleted or decrypted while this was encrypting
  putList(id, { ...cur, encryptedPayload: payload });
  putListSecrets(id, secrets, payload, false);
}

function editItem(id: ListItemId, edit: (i: ListItem) => ListItem): void {
  const raw = useListStore.getState().listItems[id];
  if (!raw) return;
  if (!raw.isEncrypted) {
    putItem(id, { ...edit(raw), updatedAt: now() });
    return;
  }
  if (isItemLocked(raw)) {
    console.warn('[listStore] ignored an edit to a locked encrypted list item:', id);
    return;
  }
  const edited = edit(itemView(raw));
  const secrets = extractItemSecrets(edited);
  putItemSecrets(id, secrets, raw.encryptedPayload, true);
  putItem(id, { ...blankItemSecrets(edited), isEncrypted: true, encryptedPayload: raw.encryptedPayload, updatedAt: now() });
  queueEncrypt(`item:${id}`, secrets, (payload) => landItemPayload(id, secrets, payload));
}

function landItemPayload(id: ListItemId, secrets: ItemSecrets, payload: string): void {
  const cur = useListStore.getState().listItems[id];
  if (!cur || !cur.isEncrypted) return;
  putItem(id, { ...cur, encryptedPayload: payload });
  putItemSecrets(id, secrets, payload, false);
}

async function encryptItemImpl(id: ListItemId): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = useListStore.getState().listItems[id];
    if (!raw || raw.isEncrypted) return;
    const secrets = extractItemSecrets(raw);
    const payload = await encryptSecrets(secrets);
    if (useListStore.getState().listItems[id] !== raw) continue; // edited mid-encrypt — redo on the fresh data
    putItem(id, { ...blankItemSecrets(raw), isEncrypted: true, encryptedPayload: payload, updatedAt: now() });
    putItemSecrets(id, secrets, payload, false);
    return;
  }
  throw new Error('A list item kept changing while it was being encrypted; try again.');
}

async function decryptItemImpl(id: ListItemId): Promise<void> {
  const raw = useListStore.getState().listItems[id];
  if (!raw || !raw.isEncrypted) return;
  // Don't rely on the cache being warm: it's filled asynchronously after unlock.
  const secrets = isItemLocked(raw)
    ? (raw.encryptedPayload ? await decryptSecrets<ItemSecrets>(raw.encryptedPayload) : null)
    : extractItemSecrets(itemView(raw));
  if (!secrets) throw new Error('Could not read this item\u2019s encrypted contents.');
  putItem(id, {
    ...raw, title: secrets.title, data: secrets.data, notes: secrets.notes, links: secrets.links,
    isEncrypted: false, encryptedPayload: null, updatedAt: now(),
  });
  dropItemSecrets(id);
}

async function encryptListImpl(id: ListId): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = useListStore.getState().lists[id];
    if (!raw || raw.isEncrypted) return;
    const secrets = extractListSecrets(raw);
    const payload = await encryptSecrets(secrets); // rejects "Vault is locked" if it is
    if (useListStore.getState().lists[id] !== raw) continue; // edited mid-encrypt — redo
    putList(id, { ...blankListSecrets(raw), isEncrypted: true, encryptedPayload: payload, updatedAt: now() });
    putListSecrets(id, secrets, payload, false);
    await Promise.all(itemsOfList(id).map((i) => encryptItemImpl(i.id)));
    return;
  }
  throw new Error('This list kept changing while it was being encrypted; try again.');
}

async function decryptListImpl(id: ListId): Promise<void> {
  const raw = useListStore.getState().lists[id];
  if (!raw || !raw.isEncrypted) return;
  // Decrypt from the payload if the cache isn't warm, rather than refusing.
  const secrets = isListLocked(raw)
    ? (raw.encryptedPayload ? await decryptSecrets<ListSecrets>(raw.encryptedPayload) : null)
    : extractListSecrets(listView(raw));
  if (!secrets) throw new Error('Could not read this list\u2019s encrypted contents.');
  putList(id, {
    ...raw, name: secrets.name, description: secrets.description, typeId: secrets.typeId,
    fieldSchema: secrets.fieldSchema, tabs: secrets.tabs,
    isEncrypted: false, encryptedPayload: null, updatedAt: now(),
  });
  dropListSecrets(id);
  await Promise.all(itemsOfList(id).map((i) => decryptItemImpl(i.id)));
}

export { BUILTIN_LIST_TYPES, WATCHLIST_TYPE_IDS };
export type { ListFieldSchema, ListTab };
