import type { CollectionId, NoteTag } from '@/types';

// The Stickies notebook (services/stickyNotes.ts) is a special set of notes, not one notebook among
// the others: at the top level it is pinned first, with a line under it, in every Notes view (the
// Tree, the Mosaic, the Map; 2026-10-18). THE order of notebooks among their siblings is
// byNotebookOrder: pinned first, then their own order.
export const STICKIES_PRESET = 'stickies';

export function isPinnedNotebook(t: Pick<NoteTag, 'kind' | 'presetKey' | 'parentTagId'>): boolean {
  return t.kind === 'area' && !t.parentTagId && t.presetKey === STICKIES_PRESET;
}

export function byNotebookOrder(a: NoteTag, b: NoteTag): number {
  return Number(isPinnedNotebook(b)) - Number(isPinnedNotebook(a)) || a.order - b.order || a.name.localeCompare(b.name);
}

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

// Notebook tree icon: an explicit user-chosen icon always wins; otherwise the icon reflects
// what the notebook actually contains, so folders read differently at a glance — empty,
// sub-notebooks only, notes only, or both.
export function getNotebookIcon(
  tag: NoteTag,
  noteTags: Record<string, NoteTag>,
  notes: Record<string, { tagIds: readonly string[]; archivedAt: string | null }>,
): string {
  if (tag.icon) return tag.icon;
  if (tag.kind === 'tag') return '🏷️';
  const hasChildren = Object.values(noteTags).some((t) => t.parentTagId === tag.id && t.kind === 'area');
  const hasNotes = Object.values(notes).some((n) => n.tagIds.includes(tag.id) && !n.archivedAt);
  if (hasChildren && hasNotes) return '📚';
  if (hasChildren) return '🗂️';
  if (hasNotes) return '📓';
  return '📁';
}

// The notebook (kind='area') a note belongs to, for syncing the tree/list panels to whatever
// note is actually being shown — e.g. uiStore.openNote() sets selectedNoteTagId from this so
// jumping to a note NOT via its own notebook's list (Quick Access, a cross-app link,
// Alt+Left/Right across notebooks) still leaves the tree pointing at the right place, rather
// than whatever notebook happened to be selected before (a real, reported bug, 2026-09-25).
// Unlike getNoteBreadcrumb below, this never falls back to an annotation tag — the result has
// to be a real notebook id or null, since it's used to set selectedNoteTagId directly. A note
// filed into more than one notebook (rare, but not prevented) picks whichever sorts first in
// its own tagIds order — same ambiguity getNoteBreadcrumb already lives with.
export function getNotePrimaryNotebookId(
  note: { tagIds: readonly string[] },
  noteTags: Record<string, NoteTag>,
): string | null {
  return note.tagIds.find((tagId) => noteTags[tagId]?.kind === 'area') ?? null;
}

// Breadcrumb string for a note's location in the notebook tree (e.g. "Notes > Exchanges >
// Australia") — used wherever a note needs to show its context to the user without a full
// tree UI (e.g. the cross-app note picker). Takes the
// first notebook tagId that resolves to a real ancestor chain (annotation tags are only a
// fallback — they aren't a location); a note with no notebook tag at all reads "Uncategorized".
export function getNoteBreadcrumb(
  note: { tagIds: readonly string[] },
  noteTags: Record<string, NoteTag>,
): string {
  const path = getNoteNotebookPath(note, noteTags);
  return path.length > 0 ? path.join(' > ') : 'Uncategorized';
}

// The names from the root notebook down to the one a note is filed in (its first notebook, else
// its first tag); empty when it's in neither.
export function getNoteNotebookPath(
  note: { tagIds: readonly string[] },
  noteTags: Record<string, NoteTag>,
): string[] {
  const ordered = [...note.tagIds].sort((a, b) => Number(noteTags[b]?.kind === 'area') - Number(noteTags[a]?.kind === 'area'));
  for (const tagId of ordered) {
    const path: string[] = [];
    let curr: NoteTag | undefined = noteTags[tagId];
    while (curr) {
      path.unshift(curr.name);
      curr = curr.parentTagId ? noteTags[curr.parentTagId] : undefined;
    }
    if (path.length > 0) return path;
  }
  return [];
}

// A note's name as shown away from its notebook (CLAUDE.md "A note is named with its notebook",
// 2026-10-17): a title alone rarely says which note it is (many notes are called "Lectures"), so
// wherever notes from different notebooks are shown together the notebook goes with it. `title`
// (the note's own, or `untitled`), `notebook` (the notebook it's filed in, nearest first; null when
// in none, or when it is `here`, the notebook already being looked at), `path` (root → notebook,
// for a tooltip) and `full`, one line for plain text: "Lectures · Biology".
export interface NoteName { title: string; notebook: string | null; path: string; full: string }

export function noteName(
  note: { title: string; tagIds: readonly string[] },
  noteTags: Record<string, NoteTag>,
  opts: { untitled: string; here?: string | null },
): NoteName {
  const title = note.title.trim() || opts.untitled;
  const primary = getNotePrimaryNotebookId(note, noteTags);
  const path = getNoteNotebookPath(note, noteTags);
  const notebook = primary && primary !== opts.here ? noteTags[primary]?.name ?? null : null;
  return { title, notebook, path: path.join(' › '), full: notebook ? `${title} · ${notebook}` : title };
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
