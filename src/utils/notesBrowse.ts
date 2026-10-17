import { getOrderedEndeavours } from '@/utils/collections';
import { byNotebookOrder, getNoteEffectiveCollectionId, isPinnedNotebook } from '@/utils/notes';
import type { Collection, Purpose } from '@/types';
import type { Note, NoteId, NoteTag } from '@/types/notes';

// The browse model behind every Notes view (CLAUDE.md "Notes views", agreed 2026-10-17): the
// notes, filtered, as a tree of groups. Every view (Tree, Mosaic, later Desk, Lenses, River) draws
// this one tree and nothing else, so they always agree on what's there and switching views keeps
// your place. Pure: `useNotesBrowse` (hooks/) feeds it from the stores.
//
// How notes are grouped is NOTE_GROUPINGS: a new way of grouping is one entry there, and no view
// changes. A group's id is `<grouping>:<id>` (groupId), unique across groupings.

export type NoteGroupingId = 'notebook' | 'endeavour' | 'purpose' | 'tag';

export interface NotesFilter {
  collectionIds: string[];   // Endeavours
  purposeIds:    string[];   // through the note's Endeavour
  tagIds:        string[];   // annotation tags (NoteTag kind 'tag')
}
export const EMPTY_NOTES_FILTER: NotesFilter = { collectionIds: [], purposeIds: [], tagIds: [] };

export interface NoteGroup {
  id:        string;                   // groupId(grouping, sourceId)
  sourceId:  string;                   // the own id of what the group is (a notebook, a collection, a purpose, a tag)
  grouping:  NoteGroupingId;
  label:     string;
  color:     string | null;
  icon:      string | null;
  children:  NoteGroup[];
  noteIds:   NoteId[];                 // notes directly in this group, most recently changed first
  total:     number;                   // notes in this group and every group inside it (a note counted once)
  updatedAt: string | null;            // the most recent change to a note anywhere inside it
  pinned:    boolean;                  // kept first, with a line after it (the Stickies notebook)
}

export interface BrowseInput {
  notes:       Note[];                 // already readable (views of encrypted notes)
  noteTags:    Record<string, NoteTag>;
  collections: Record<string, Collection>;
  purposes:    Record<string, Purpose>;
  filter:      NotesFilter;
}

export interface NotesBrowse {
  grouping: NoteGroupingId;
  roots:    NoteGroup[];
  loose:    NoteId[];                  // notes in no group of this grouping
  notes:    Record<string, Note>;      // the notes that passed the filter, by id
  // Sub-notes under their parent note (a sub-note isn't placed in groups itself, as in the Tree).
  subNotes: Record<string, NoteId[]>;
}

export const groupId = (grouping: NoteGroupingId, sourceId: string) => `${grouping}:${sourceId}`;

// ── Filtering ────────────────────────────────────────────────────────────────

export function isFilterEmpty(f: NotesFilter): boolean {
  return f.collectionIds.length === 0 && f.purposeIds.length === 0 && f.tagIds.length === 0;
}

// A note's Endeavour: its own, else its notebook's (the same rule the Tree filters by).
const endeavourOf = (note: Note, noteTags: Record<string, NoteTag>): string | null => getNoteEffectiveCollectionId(note, noteTags);

export function passesFilter(note: Note, f: NotesFilter, collections: Record<string, Collection>, noteTags: Record<string, NoteTag>): boolean {
  const endeavour = endeavourOf(note, noteTags);
  if (f.collectionIds.length && !(endeavour && f.collectionIds.includes(endeavour))) return false;
  if (f.purposeIds.length) {
    const purposes = endeavour ? collections[endeavour]?.purposeIds ?? [] : [];
    if (!purposes.some((p) => f.purposeIds.includes(p))) return false;
  }
  if (f.tagIds.length && !note.tagIds.some((t) => f.tagIds.includes(t))) return false;
  return true;
}

// ── Groupings ────────────────────────────────────────────────────────────────

interface GroupSeed { sourceId: string; label: string; color: string | null; icon: string | null; parentId: string | null; pinned?: boolean }

export interface NoteGrouping {
  id: NoteGroupingId;
  // The groups (flat, each naming its parent's sourceId, or null at the top), in display order.
  groups: (input: BrowseInput) => GroupSeed[];
  // The sourceIds of the groups a note belongs to directly.
  of: (note: Note, input: BrowseInput) => string[];
}

const byOrder = (a: NoteTag, b: NoteTag) => a.order - b.order || a.name.localeCompare(b.name);

export const NOTE_GROUPINGS: Record<NoteGroupingId, NoteGrouping> = {
  // Notebooks and the notebooks inside them: today's tree.
  notebook: {
    id: 'notebook',
    groups: ({ noteTags }) => Object.values(noteTags).filter((t) => t.kind === 'area').sort(byNotebookOrder)
      .map((t) => ({ sourceId: t.id, label: t.name, color: t.color, icon: t.icon, parentId: t.parentTagId && noteTags[t.parentTagId] ? t.parentTagId : null, pinned: isPinnedNotebook(t) })),
    of: (note, { noteTags }) => note.tagIds.filter((id) => noteTags[id]?.kind === 'area'),
  },
  // Endeavours, in the order the Endeavour picker shows them (archived ones left out).
  endeavour: {
    id: 'endeavour',
    groups: ({ collections }) => getOrderedEndeavours(collections)
      .map((c) => ({ sourceId: c.id, label: c.name, color: c.color, icon: null, parentId: null })),
    of: (note, { collections, noteTags }) => {
      const e = endeavourOf(note, noteTags);
      return e && collections[e] && !collections[e].archivedAt ? [e] : [];
    },
  },
  // Purposes, through each note's Endeavour.
  purpose: {
    id: 'purpose',
    groups: ({ purposes }) => Object.values(purposes).filter((p) => !p.archivedAt).sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ sourceId: p.id, label: p.name, color: p.color, icon: null, parentId: null })),
    of: (note, { collections, purposes, noteTags }) => {
      const e = endeavourOf(note, noteTags);
      return (e ? collections[e]?.purposeIds ?? [] : []).filter((p) => purposes[p] && !purposes[p].archivedAt);
    },
  },
  // Annotation tags: cross-cutting labels.
  tag: {
    id: 'tag',
    groups: ({ noteTags }) => Object.values(noteTags).filter((t) => t.kind === 'tag').sort(byOrder)
      .map((t) => ({ sourceId: t.id, label: t.name, color: t.color, icon: t.icon, parentId: null })),
    of: (note, { noteTags }) => note.tagIds.filter((id) => noteTags[id]?.kind === 'tag'),
  },
};

// ── The tree ─────────────────────────────────────────────────────────────────

const newest = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

export function browseNotes(input: BrowseInput, grouping: NoteGroupingId): NotesBrowse {
  const def = NOTE_GROUPINGS[grouping];
  const notes = input.notes
    .filter((n) => !n.archivedAt && passesFilter(n, input.filter, input.collections, input.noteTags))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shown = new Set(notes.map((n) => n.id as string));
  const subNotes: Record<string, NoteId[]> = {};
  for (const n of notes) if (n.parentId && shown.has(n.parentId)) (subNotes[n.parentId] ??= []).push(n.id);
  const seeds = def.groups(input);
  const bySource = new Map<string, NoteGroup>();
  for (const s of seeds) {
    bySource.set(s.sourceId, {
      id: groupId(grouping, s.sourceId), sourceId: s.sourceId, grouping, label: s.label, color: s.color, icon: s.icon,
      children: [], noteIds: [], total: 0, updatedAt: null, pinned: !!s.pinned && !s.parentId,
    });
  }
  const loose: NoteId[] = [];
  for (const n of notes) {
    if (n.parentId && shown.has(n.parentId)) continue;
    const homes = def.of(n, input).filter((id) => bySource.has(id));
    if (homes.length === 0) loose.push(n.id);
    for (const id of homes) bySource.get(id)!.noteIds.push(n.id);
  }
  const roots: NoteGroup[] = [];
  const parentOf = new Map(seeds.map((s) => [s.sourceId, s.parentId] as const));
  for (const s of seeds) {
    const g = bySource.get(s.sourceId)!;
    const parent = s.parentId ? bySource.get(s.parentId) : undefined;
    // A parent that would make a loop (bad data) is ignored: the group goes to the top.
    if (parent && !isInside(parent.sourceId, g.sourceId, parentOf)) parent.children.push(g);
    else roots.push(g);
  }
  // Totals and latest changes, counting a note once however many groups inside it hold it.
  const byId = new Map(notes.map((n) => [n.id, n] as const));
  const tally = (g: NoteGroup): Set<NoteId> => {
    const ids = new Set(g.noteIds);
    for (const c of g.children) for (const id of tally(c)) ids.add(id);
    g.total = ids.size;
    for (const id of ids) g.updatedAt = newest(g.updatedAt, byId.get(id)?.updatedAt ?? null);
    return ids;
  };
  roots.forEach(tally);
  return { grouping, roots, loose, notes: Object.fromEntries(byId), subNotes };
}

// Whether `parent` sits inside `child` (following the seeds' parents up), i.e. linking them would loop.
function isInside(parent: string, child: string, parentOf: Map<string, string | null>): boolean {
  const seen = new Set<string>();
  for (let at: string | null | undefined = parent; at; at = parentOf.get(at)) {
    if (at === child) return true;
    if (seen.has(at)) return true;
    seen.add(at);
  }
  return false;
}

// The groups from the top down to `id` (empty when it isn't in the tree): the trail a view shows
// and zooms along.
export function groupPath(roots: NoteGroup[], id: string | null): NoteGroup[] {
  if (!id) return [];
  const walk = (groups: NoteGroup[], trail: NoteGroup[]): NoteGroup[] | null => {
    for (const g of groups) {
      const here = [...trail, g];
      if (g.id === id) return here;
      const found = walk(g.children, here);
      if (found) return found;
    }
    return null;
  };
  return walk(roots, []) ?? [];
}
