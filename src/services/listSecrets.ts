import { bumpSecretsVersion } from '@/services/noteSecrets';
import type { List, ListItem, ListTab, ListFieldSchema, ListTypeId } from '@/types/lists';

// Encrypted lists / list items — same model as encrypted notes (see services/noteSecrets.ts and
// CLAUDE.md "Client-side encryption"). When a list is encrypted, its sensitive fields move into
// ONE AES-GCM envelope (`encryptedPayload`) and are BLANKED on the stored object — in zustand,
// localStorage and Supabase alike. Every item of an encrypted list is encrypted the same way,
// each with its own envelope. Plaintext exists only in the memory caches below, filled while the
// vault is unlocked (listSecretsSync.ts) and wiped on lock.
//
// READING: go through listView()/itemView() (React: store/listViews.ts) — the stored fields of an
// encrypted list are blank. WRITING: go through the listStore actions, which route encrypted
// lists themselves (apply to the cache instantly, re-encrypt in the background).
//
// Crypto, the serialised re-encrypt queue and the cache-version counter are shared with notes
// (noteSecrets.ts) — only the caches and the field lists differ.

export const LOCKED_LIST_NAME = 'Encrypted list';
export const LOCKED_ITEM_TITLE = 'Encrypted item';

export interface ListSecrets {
  v: 1;
  name: string;
  description: string | null;
  typeId: ListTypeId | null;
  fieldSchema: ListFieldSchema[];
  tabs: ListTab[];
}

export interface ItemSecrets {
  v: 1;
  title: string;
  data: Record<string, unknown>;
  notes: string | null;
  links: string[];
}

export const extractListSecrets = (l: List): ListSecrets => ({
  v: 1, name: l.name, description: l.description, typeId: l.typeId, fieldSchema: l.fieldSchema, tabs: l.tabs,
});
// kind/color/icon stay plaintext (structure, not content); typeId is blanked because a list's
// type ("Credentials", "Memberships") is itself revealing.
export const blankListSecrets = (l: List): List => ({
  ...l, name: '', description: null, typeId: null, fieldSchema: [], tabs: [],
});
export const applyListSecrets = (l: List, s: ListSecrets): List => ({
  ...l, name: s.name, description: s.description, typeId: s.typeId, fieldSchema: s.fieldSchema, tabs: s.tabs,
});

// status/tabId/order stay plaintext, same reasoning.
export const extractItemSecrets = (i: ListItem): ItemSecrets => ({
  v: 1, title: i.title, data: i.data, notes: i.notes, links: i.links,
});
export const blankItemSecrets = (i: ListItem): ListItem => ({ ...i, title: '', data: {}, notes: null, links: [] });
export const applyItemSecrets = (i: ListItem, s: ItemSecrets): ListItem => ({
  ...i, title: s.title, data: s.data, notes: s.notes, links: s.links,
});

// ── Memory-only plaintext caches (semantics identical to noteSecrets.ts's) ──────────────────

interface CacheEntry<S> { payload: string | null; secrets: S; dirty: boolean }
const listCache = new Map<string, CacheEntry<ListSecrets>>();
const itemCache = new Map<string, CacheEntry<ItemSecrets>>();

export const getListSecrets = (id: string) => listCache.get(id);
export const getItemSecrets = (id: string) => itemCache.get(id);
export function putListSecrets(id: string, secrets: ListSecrets, payload: string | null, dirty = false) {
  listCache.set(id, { secrets, payload, dirty }); bumpSecretsVersion();
}
export function putItemSecrets(id: string, secrets: ItemSecrets, payload: string | null, dirty = false) {
  itemCache.set(id, { secrets, payload, dirty }); bumpSecretsVersion();
}
export function dropListSecrets(id: string) { if (listCache.delete(id)) bumpSecretsVersion(); }
export function dropItemSecrets(id: string) { if (itemCache.delete(id)) bumpSecretsVersion(); }
export function clearListSecretsCache() {
  if (listCache.size === 0 && itemCache.size === 0) return;
  listCache.clear(); itemCache.clear(); bumpSecretsVersion();
}

const usable = <S,>(e: CacheEntry<S> | undefined, payload: string | null): e is CacheEntry<S> =>
  !!e && (e.dirty || (payload !== null && e.payload === payload));

// ── The overlay — the one way to read a possibly-encrypted list / item ──────────────────────

export function isListLocked(l: List): boolean {
  return l.isEncrypted && !usable(listCache.get(l.id), l.encryptedPayload);
}
export function listView(l: List): List {
  if (!l.isEncrypted) return l;
  const e = listCache.get(l.id);
  if (usable(e, l.encryptedPayload)) return applyListSecrets(l, e.secrets);
  return { ...l, name: LOCKED_LIST_NAME };
}
export function isItemLocked(i: ListItem): boolean {
  return i.isEncrypted && !usable(itemCache.get(i.id), i.encryptedPayload);
}
export function itemView(i: ListItem): ListItem {
  if (!i.isEncrypted) return i;
  const c = itemCache.get(i.id);
  if (usable(c, i.encryptedPayload)) return applyItemSecrets(i, c.secrets);
  return { ...i, title: LOCKED_ITEM_TITLE };
}
