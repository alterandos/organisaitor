import type { Collection, CollectionId, TagId } from '@/types';
import type { NoteTag } from '@/types/notes';
import { endeavourAncestors } from '@/utils/endeavourGraph';
import { getNoteEffectiveCollectionId } from '@/utils/notes';

// The rules of the suite's tags passing down (agreed with the user 2026-11-06), here and nowhere
// else: an Endeavour has its own tags and those of every Endeavour it's part of; a notebook its own,
// its parent notebooks' and its Endeavour's; an item its own and its Endeavour's (a note: its
// notebooks' too). Every tag filter asks `tagTest` (pattern test "tag filters go through
// utils/tagScope.ts"), so filtering by "University" finds a subject tagged only through its
// semester, and what's filed under it.

type Collections = Record<string, Collection>;
type NoteTags = Record<string, NoteTag>;

export interface InheritedTag { id: TagId; from: string }   // `from`: the Endeavour (or notebook) it comes from

// The tags an Endeavour takes from those it's part of (the nearest first), not its own.
export function inheritedEndeavourTags(id: string, all: Collections): InheritedTag[] {
  const own = new Set(all[id]?.tagIds ?? []);
  const out: InheritedTag[] = [];
  const seen = new Set<string>();
  for (const a of endeavourAncestors(id, all)) {
    for (const t of all[a]?.tagIds ?? []) if (!own.has(t) && !seen.has(t)) { seen.add(t); out.push({ id: t, from: a }); }
  }
  return out;
}

// The tags it takes when it's made part of `parents` (the creator, before it exists).
export function tagsFromParents(parents: readonly string[], all: Collections): InheritedTag[] {
  const out: InheritedTag[] = [];
  const seen = new Set<string>();
  for (const p of parents) {
    for (const t of [...(all[p]?.tagIds ?? []).map((id) => ({ id, from: p })), ...inheritedEndeavourTags(p, all)]) {
      if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    }
  }
  return out;
}

export function endeavourTagIds(id: string, all: Collections): TagId[] {
  return [...new Set([...(all[id]?.tagIds ?? []), ...inheritedEndeavourTags(id, all).map((t) => t.id)])];
}

// The tags a notebook takes from the notebooks above it and its Endeavour (the nearest first).
export function inheritedNotebookTags(id: string, noteTags: NoteTags, all: Collections): InheritedTag[] {
  const own = new Set(noteTags[id]?.suiteTagIds ?? []);
  const out: InheritedTag[] = [];
  const seen = new Set<string>();
  const add = (t: TagId, from: string) => { if (!own.has(t) && !seen.has(t)) { seen.add(t); out.push({ id: t, from }); } };
  const visited = new Set<string>([id]);
  for (let p = noteTags[id]?.parentTagId; p && !visited.has(p); p = noteTags[p]?.parentTagId) {
    visited.add(p);
    for (const t of noteTags[p]?.suiteTagIds ?? []) add(t, p);
  }
  for (const nb of [id, ...visited]) {
    const c = noteTags[nb]?.collectionId;
    if (c) for (const t of endeavourTagIds(c, all)) add(t, c);
  }
  return out;
}

// What an item is: its own tags, the Endeavour it's filed under, and (a note) its notebooks.
export interface TaggedItem { tagIds?: readonly string[] | null; collectionId?: string | null; notebookIds?: readonly string[] }

export type TagTest = (item: TaggedItem) => boolean;

// A test for "has one of these tags, its own or passed down", or null when no tag is chosen.
export function tagTest(active: readonly string[], all: Collections, noteTags: NoteTags = {}): TagTest | null {
  if (!active.length) return null;
  const want = new Set(active);
  const hit = (ids: readonly string[] | null | undefined) => !!ids?.some((t) => want.has(t));
  const endeavours = new Set(Object.keys(all).filter((id) => hit(endeavourTagIds(id, all))));
  const notebooks = new Set(Object.keys(noteTags).filter((id) => noteTags[id].kind === 'area'
    && (hit(noteTags[id].suiteTagIds) || inheritedNotebookTags(id, noteTags, all).some((t) => want.has(t.id)))));
  return (item) => hit(item.tagIds)
    || (!!item.collectionId && endeavours.has(item.collectionId))
    || !!item.notebookIds?.some((n) => notebooks.has(n));
}

// A note as a tagged item: its own tags, its Endeavour (its own, else its notebook's) and its notebooks.
export function noteItem(note: { suiteTagIds?: readonly string[]; tagIds: readonly string[]; collectionId: CollectionId | null }, noteTags: NoteTags): TaggedItem {
  return { tagIds: note.suiteTagIds, collectionId: getNoteEffectiveCollectionId(note, noteTags), notebookIds: note.tagIds };
}

// The tags a note takes from its notebooks (and theirs) and its Endeavour, nearest first.
export function tagsForNote(notebookIds: readonly string[], collectionId: string | null, noteTags: NoteTags, all: Collections): InheritedTag[] {
  const out: InheritedTag[] = [];
  const seen = new Set<string>();
  const add = (t: InheritedTag) => { if (!seen.has(t.id)) { seen.add(t.id); out.push(t); } };
  for (const nb of notebookIds) {
    if (noteTags[nb]?.kind !== 'area') continue;
    for (const t of noteTags[nb].suiteTagIds ?? []) add({ id: t, from: nb });
    for (const t of inheritedNotebookTags(nb, noteTags, all)) add(t);
  }
  if (collectionId) for (const t of [...(all[collectionId]?.tagIds ?? []).map((id) => ({ id, from: collectionId })), ...inheritedEndeavourTags(collectionId, all)]) add(t);
  return out;
}

// What an inherited tag comes from, by name: an Endeavour or a notebook.
export function sourceName(id: string, noteTags: NoteTags, all: Collections): string {
  return all[id]?.name ?? noteTags[id]?.name ?? '';
}

// The tags a notebook made inside `parentId` and for `collectionId` takes (before it exists).
export function tagsFromNotebookPlace(parentId: string | null, collectionId: string | null, noteTags: NoteTags, all: Collections): InheritedTag[] {
  return tagsForNote(parentId ? [parentId] : [], collectionId, noteTags, all);
}
