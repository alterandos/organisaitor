import type { Collection, CollectionId } from '@/types';
import type { NoteTag } from '@/types/notes';
import { getNoteEffectiveCollectionId, isPinnedNotebook } from '@/utils/notes';

// Encryption by scope (CLAUDE.md "Encryption by scope"): the pure rules for "must this be kept
// encrypted, and because of what?". A scope is a container whose setting covers what's in it: a
// notebook (and the notebooks inside it) or an Endeavour. Nothing here reads a store, so the rules
// are the same for the enforcer, the sync hold, the UI and the tests.
//
// A new scope (a calendar, a section, the whole account) is a member of EncryptionScopeKind and a
// check in the matching `…Scopes` function; a new kind of item gets its own `…Scopes` function and
// an entry in services/encryption/kinds.ts.

export type EncryptionScopeKind = 'notebook' | 'endeavour';

export interface EncryptionScope {
  kind: EncryptionScopeKind;
  id: string;
  name: string;
}

export interface ScopeContext {
  noteTags: Record<string, NoteTag>;
  collections: Record<string, Collection>;
}

// The notebook whose setting covers this one: itself or the nearest notebook above it that has the
// setting on. The pinned notebooks (Stickies, Scratchpad) never take it, nor pass it down.
export function notebookEncryptionSource(tag: NoteTag | undefined, noteTags: Record<string, NoteTag>): NoteTag | null {
  const seen = new Set<string>();
  let cur = tag;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.kind === 'area' && cur.encryptContents && !isPinnedNotebook(cur)) return cur;
    cur = cur.parentTagId ? noteTags[cur.parentTagId] : undefined;
  }
  return null;
}

export function endeavourEncrypts(id: CollectionId | null | undefined, collections: Record<string, Collection>): Collection | null {
  const c = id ? collections[id] : undefined;
  return c && c.encryptContents && (c.kind === 'project' || c.kind === 'list') ? c : null;
}

function addUnique(out: EncryptionScope[], s: EncryptionScope) {
  if (!out.some((o) => o.kind === s.kind && o.id === s.id)) out.push(s);
}

// Why a note must be encrypted: every notebook it's in (or under) that encrypts its contents, and
// its Endeavour (its own, else its notebook's) if that does. Empty = it needn't be.
export function noteScopes(note: { tagIds: readonly string[]; collectionId: CollectionId | null }, ctx: ScopeContext): EncryptionScope[] {
  const out: EncryptionScope[] = [];
  for (const tagId of note.tagIds) {
    const src = notebookEncryptionSource(ctx.noteTags[tagId], ctx.noteTags);
    if (src) addUnique(out, { kind: 'notebook', id: src.id, name: src.name });
  }
  const e = endeavourEncrypts(getNoteEffectiveCollectionId(note, ctx.noteTags), ctx.collections);
  if (e) addUnique(out, { kind: 'endeavour', id: e.id, name: e.name });
  return out;
}

export function listScopes(list: { collectionId: CollectionId | null }, ctx: ScopeContext): EncryptionScope[] {
  const e = endeavourEncrypts(list.collectionId, ctx.collections);
  return e ? [{ kind: 'endeavour', id: e.id, name: e.name }] : [];
}

export const noteMustBeEncrypted = (note: Parameters<typeof noteScopes>[0], ctx: ScopeContext) => noteScopes(note, ctx).length > 0;
export const listMustBeEncrypted = (list: Parameters<typeof listScopes>[0], ctx: ScopeContext) => listScopes(list, ctx).length > 0;
