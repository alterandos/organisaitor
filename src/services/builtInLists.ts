import { useListStore } from '@/store/listStore';
import { isListLocked, itemView, listView } from '@/services/listSecrets';
import type { List, ListId, ListItem, ListTypeId } from '@/types/lists';

// A built-in list fed from elsewhere (CLAUDE.md "A built-in list fed from elsewhere", adopted
// 2026-11-02): the Dictionary, the reading list, Interesting facts, and the next one. Each is a list
// of a built-in type (listStore BUILTIN_LIST_TYPES), found by its type (and, where the type is a
// general one like Books, its name), made the first time something is added, and given any field
// its type gained since it was made. A locked (encrypted) one is treated as absent: what's in it
// can't be read, so nothing is added to it.

export interface BuiltInListSpec { typeId: ListTypeId; name: string; matchName?: boolean }

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The list, if there is one (the oldest, when there are several).
export function builtInList(spec: BuiltInListSpec): List | null {
  const lists = Object.values(useListStore.getState().lists).filter((l) => {
    if (isListLocked(l)) return false;
    const v = listView(l);
    return v.typeId === spec.typeId && (!spec.matchName || sameName(v.name, spec.name));
  });
  lists.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return lists[0] ?? null;
}

// A list made before a field was added to its type gains it.
export function refreshBuiltInListFields(spec: BuiltInListSpec): void {
  const existing = builtInList(spec);
  if (!existing) return;
  const have = new Set(listView(existing).fieldSchema.map((f) => f.id));
  const missing = (useListStore.getState().listTypes[spec.typeId]?.defaultFields ?? []).filter((f) => !have.has(f.id));
  if (missing.length) useListStore.getState().updateList(existing.id, { fieldSchema: [...listView(existing).fieldSchema, ...missing] });
}

// The list's id, made now (with its type's icon, colour, kind and fields) if there isn't one.
export function ensureBuiltInList(spec: BuiltInListSpec): ListId {
  const existing = builtInList(spec);
  if (existing) {
    refreshBuiltInListFields(spec);
    return existing.id;
  }
  const type = useListStore.getState().listTypes[spec.typeId];
  return useListStore.getState().addList({
    name: spec.name, typeId: spec.typeId, kind: type?.kind ?? 'reference',
    icon: type?.icon ?? null, color: type?.color ?? null, fieldSchema: type?.defaultFields,
  });
}

// The item in that list whose title is `title` (any case, spacing aside), if there is one.
export function builtInListItem(listId: ListId, title: string): ListItem | null {
  const t = title.trim().replace(/\s+/g, ' ').toLowerCase();
  return Object.values(useListStore.getState().listItems)
    .find((i) => i.listId === listId && itemView(i).title.trim().replace(/\s+/g, ' ').toLowerCase() === t) ?? null;
}
