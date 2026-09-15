import type { CollectionId, NoteTag } from '@/types';

// Effective Endeavour for a notebook: its own collectionId, or the nearest
// ancestor notebook's. Lets a sub-notebook inherit an Endeavour set higher up the tree.
export function getEffectiveCollectionId(
  tag: NoteTag,
  noteTags: Record<string, NoteTag>,
): CollectionId | null {
  let current: NoteTag | undefined = tag;
  while (current) {
    if (current.collectionId) return current.collectionId;
    current = current.parentTagId ? noteTags[current.parentTagId] : undefined;
  }
  return null;
}

// Endeavour a new note should inherit from its selected notebook tag(s), walking each
// tag's ancestor chain for the nearest one with a collectionId set.
export function resolveNoteInheritedCollectionId(
  tagIds: readonly string[],
  noteTags: Record<string, NoteTag>,
): CollectionId | null {
  for (const tagId of tagIds) {
    const tag = noteTags[tagId];
    if (!tag) continue;
    const resolved = getEffectiveCollectionId(tag, noteTags);
    if (resolved) return resolved;
  }
  return null;
}

// Effective Endeavour for an existing note: its own collectionId if set, else whatever
// it would inherit from its notebook tags today. Used for Endeavour-focus filtering so
// notes created before collectionId existed still show up under their notebook's Endeavour.
export function getNoteEffectiveCollectionId(
  note: { collectionId: CollectionId | null; tagIds: readonly string[] },
  noteTags: Record<string, NoteTag>,
): CollectionId | null {
  return note.collectionId ?? resolveNoteInheritedCollectionId(note.tagIds, noteTags);
}

// Notebook IDs that should stay visible when focused on a given Endeavour: notebooks whose
// effective Endeavour matches, plus their ancestors (so the tree stays navigable to reach them).
export function getVisibleNoteTagIds(
  noteTags: Record<string, NoteTag>,
  activeCollectionId: CollectionId,
): Set<string> {
  const areaTags = Object.values(noteTags).filter((t) => t.kind === 'area');
  const visible = new Set<string>();
  for (const tag of areaTags) {
    if (getEffectiveCollectionId(tag, noteTags) !== activeCollectionId) continue;
    visible.add(tag.id);
    let current = tag;
    while (current.parentTagId) {
      visible.add(current.parentTagId);
      const parent = noteTags[current.parentTagId];
      if (!parent) break;
      current = parent;
    }
  }
  return visible;
}
