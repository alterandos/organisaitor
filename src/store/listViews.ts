import { useMemo } from 'react';
import { useListStore } from '@/store/listStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { listView, itemView } from '@/services/listSecrets';
import type { List, ListId, ListItem, ListItemId } from '@/types/lists';

// React-side of the "read a list through listView()" rule (see services/listSecrets.ts): lists and
// items with encrypted ones resolved from the plaintext cache (or a locked placeholder),
// re-derived whenever the store OR the cache changes. Use these instead of
// `useListStore((s) => s.lists)` wherever a list's name/description/fields/tabs or an item's
// title/data/notes/links is read.

export function useListViews(): Record<ListId, List> {
  const lists = useListStore((s) => s.lists);
  const version = useSecretsVersion((s) => s.version);
  return useMemo(() => {
    void version;
    const out = {} as Record<ListId, List>;
    for (const [id, l] of Object.entries(lists)) out[id as ListId] = listView(l);
    return out;
  }, [lists, version]);
}


export function useListItemViews(): Record<ListItemId, ListItem> {
  const items = useListStore((s) => s.listItems);
  const version = useSecretsVersion((s) => s.version);
  return useMemo(() => {
    void version;
    const out = {} as Record<ListItemId, ListItem>;
    for (const [id, i] of Object.entries(items)) out[id as ListItemId] = itemView(i);
    return out;
  }, [items, version]);
}
