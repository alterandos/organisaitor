import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useTaskStore } from '@/store/taskStore';
import { listScopes, noteScopes, type EncryptionScope, type ScopeContext } from '@/utils/encryptionScopes';
import type { Note, StructuredTagEntry } from '@/types/notes';
import type { List, ListItem } from '@/types/lists';
import type { TrashEntry } from '@/types/trash';

// Encryption by scope — the kinds of item a scope can cover (CLAUDE.md "Encryption by scope").
// Each kind says where its records are, which scopes cover one, whether it's encrypted yet and how
// to encrypt it (always the store's own encrypt action, so the per-item model in noteSecrets.ts /
// listSecrets.ts is the only encryption code). `holds` are the sync tables that must not upload a
// record of this kind (or one that follows it, like a list's items) while it's covered but not yet
// encrypted: sync asks heldFromSync() before every upload.
//
// A new kind (tasks, calendar items, …) is one entry here, its scope rule in utils/encryptionScopes.ts,
// and an encrypt action on its store. The pattern test checks every kind's tables are held.

export interface EncryptableKind {
  id: 'note' | 'list';
  records: () => Record<string, unknown>;
  scopes: (record: unknown, ctx: ScopeContext) => EncryptionScope[];
  isEncrypted: (record: unknown) => boolean;
  title: (record: unknown) => string;
  encrypt: (id: string) => Promise<void>;
  holds: Record<string, (record: unknown, ctx: ScopeContext) => boolean>;
}

export function scopeContext(): ScopeContext {
  return { noteTags: useNoteStore.getState().noteTags, collections: useTaskStore.getState().collections };
}

const noteCovered = (n: Note | undefined, ctx: ScopeContext) => !!n && noteScopes(n, ctx).length > 0;
const listCovered = (l: List | undefined, ctx: ScopeContext) => !!l && listScopes(l, ctx).length > 0;

// A Recycling Bin snapshot of a covered item that was deleted before it was encrypted.
function trashHeld(e: TrashEntry, ctx: ScopeContext): boolean {
  const s = e.snapshot as Record<string, unknown> | null;
  if (!s || s.isEncrypted) return false;
  switch (e.kind) {
    case 'note': return noteCovered(s as unknown as Note, ctx);
    case 'list': return listCovered(s as unknown as List, ctx);
    case 'listItem': return listCovered(useListStore.getState().lists[(s as unknown as ListItem).listId], ctx);
    case 'structuredTagEntry': return noteCovered(useNoteStore.getState().notes[(s as unknown as StructuredTagEntry).noteId], ctx);
    default: return false;
  }
}

export const ENCRYPTABLE_KINDS: EncryptableKind[] = [
  {
    id: 'note',
    records: () => useNoteStore.getState().notes,
    scopes: (r, ctx) => noteScopes(r as Note, ctx),
    isEncrypted: (r) => (r as Note).isEncrypted,
    title: (r) => (r as Note).title,
    encrypt: (id) => useNoteStore.getState().encryptNote(id as Note['id']),
    holds: {
      notes: (r, ctx) => !(r as Note).isEncrypted && noteCovered(r as Note, ctx),
      structured_tag_entries: (r, ctx) => !(r as StructuredTagEntry).isEncrypted
        && noteCovered(useNoteStore.getState().notes[(r as StructuredTagEntry).noteId], ctx),
      trash_items: (r, ctx) => trashHeld(r as TrashEntry, ctx),
    },
  },
  {
    id: 'list',
    records: () => useListStore.getState().lists,
    scopes: (r, ctx) => listScopes(r as List, ctx),
    isEncrypted: (r) => (r as List).isEncrypted,
    title: (r) => (r as List).name,
    encrypt: (id) => useListStore.getState().encryptList(id as List['id']),
    holds: {
      lists: (r, ctx) => !(r as List).isEncrypted && listCovered(r as List, ctx),
      list_items: (r, ctx) => !(r as ListItem).isEncrypted
        && listCovered(useListStore.getState().lists[(r as ListItem).listId], ctx),
      trash_items: (r, ctx) => trashHeld(r as TrashEntry, ctx),
    },
  },
];

// Whether sync must keep this record on the device for now (covered, not yet encrypted). Its change
// stays queued and goes up once it's encrypted, which is itself a change sync sees.
export function heldFromSync(table: string, record: unknown, ctx: ScopeContext = scopeContext()): boolean {
  for (const kind of ENCRYPTABLE_KINDS) {
    const held = kind.holds[table];
    if (held && held(record, ctx)) return true;
  }
  return false;
}

export interface WaitingItem { kind: EncryptableKind['id']; id: string; title: string; scopes: EncryptionScope[] }

// Every covered item not yet encrypted (made while the vault was locked, or just now).
export function waitingForEncryption(ctx: ScopeContext = scopeContext()): WaitingItem[] {
  const out: WaitingItem[] = [];
  for (const kind of ENCRYPTABLE_KINDS) {
    for (const [id, r] of Object.entries(kind.records())) {
      if (kind.isEncrypted(r)) continue;
      const scopes = kind.scopes(r, ctx);
      if (scopes.length > 0) out.push({ kind: kind.id, id, title: kind.title(r), scopes });
    }
  }
  return out;
}

export function isWaitingForEncryption(kindId: EncryptableKind['id'], record: unknown, ctx: ScopeContext = scopeContext()): boolean {
  const kind = ENCRYPTABLE_KINDS.find((k) => k.id === kindId)!;
  return !kind.isEncrypted(record) && kind.scopes(record, ctx).length > 0;
}

// The scopes that keep this item encrypted, so its encryption can't be removed on its own.
export function scopesRequiring(kindId: EncryptableKind['id'], record: unknown, ctx: ScopeContext = scopeContext()): EncryptionScope[] {
  return ENCRYPTABLE_KINDS.find((k) => k.id === kindId)!.scopes(record, ctx);
}
