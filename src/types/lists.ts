// ── Branded ID types ──────────────────────────────────────────────────────────
export type ListId     = string & { readonly _brand: 'ListId'     };
export type ListItemId = string & { readonly _brand: 'ListItemId' };
export type ListTypeId = string & { readonly _brand: 'ListTypeId' };

// ── Enumerations ──────────────────────────────────────────────────────────────
export type ListKind = 'watchlist' | 'reference';

export type ListItemStatus = 'want' | 'in-progress' | 'done';

export type ListFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'rating'
  | 'select'
  | 'boolean'
  | 'url';

// ── Tab ───────────────────────────────────────────────────────────────────────
// Optional sub-grouping within a list. Lists with no tabs are flat.
export interface ListTab {
  id:          string;           // nanoid(8)
  name:        string;
  color:       string | null;
  fieldSchema: ListFieldSchema[]; // per-tab custom fields; empty = use list's fields
}

// ── Field schema (per-list, customisable) ─────────────────────────────────────
export interface ListFieldSchema {
  id:       string;          // nanoid(8) — stable key in item.data
  name:     string;
  type:     ListFieldType;
  required?: boolean;
  options?:  string[];       // for select
  max?:      number;         // for rating (default 5)
}

// ── List type (template) ──────────────────────────────────────────────────────
// Built-ins are seeded in the store; users can add custom types.
export interface ListType {
  id:            ListTypeId;
  name:          string;
  icon:          string;           // emoji
  color:         string | null;
  kind:          ListKind;
  defaultFields: ListFieldSchema[];
  isBuiltIn:     boolean;
}

// ── List ──────────────────────────────────────────────────────────────────────
// A named collection with a type template and customised field schema.
export interface List {
  id:          ListId;
  name:        string;
  description: string | null;
  typeId:      ListTypeId | null;
  kind:        ListKind;
  color:       string | null;
  icon:        string | null;
  fieldSchema: ListFieldSchema[];
  tabs:        ListTab[];            // empty = flat list (no tab bar shown)
  // Client-side encryption (see src/services/listSecrets.ts). When true, name/description/typeId/
  // fieldSchema/tabs are BLANKED here and live only inside `encryptedPayload` — read an encrypted
  // list through listView(), never off the store directly.
  isEncrypted:      boolean;
  encryptedPayload: string | null;
  createdAt:   string;
  updatedAt:   string;
}

// ── List item ─────────────────────────────────────────────────────────────────
export interface ListItem {
  id:        ListItemId;
  listId:    ListId;
  title:     string;
  status:    ListItemStatus;         // only surfaced in UI for watchlist kind
  tabId:     string | null;          // null = unassigned; shows in All
  data:      Record<string, unknown>; // keyed by ListFieldSchema.id
  notes:     string | null;
  links:     string[];
  order:     number;
  // Same model as List.isEncrypted: title/data/notes/links blanked, held in `encryptedPayload`.
  // An item is encrypted exactly when its list is.
  isEncrypted:      boolean;
  encryptedPayload: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Input types ───────────────────────────────────────────────────────────────
export interface CreateListInput {
  name:         string;
  description?: string | null;
  typeId?:      ListTypeId | null;
  kind?:        ListKind;
  color?:       string | null;
  icon?:        string | null;
  fieldSchema?: ListFieldSchema[];
  tabs?:        ListTab[];
}

export interface CreateListItemInput {
  listId:  ListId;
  title:   string;
  status?: ListItemStatus;
  tabId?:  string | null;
  data?:   Record<string, unknown>;
  notes?:  string | null;
  links?:  string[];
  order?:  number;
}

// ── Display metadata ──────────────────────────────────────────────────────────
export const LIST_ITEM_STATUS_META: Record<ListItemStatus, { label: string; color: string }> = {
  'want':        { label: 'Want',        color: '#5b6ee1' },
  'in-progress': { label: 'In Progress', color: '#f97316' },
  'done':        { label: 'Done',        color: '#10b981' },
};
