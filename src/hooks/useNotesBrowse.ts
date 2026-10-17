import { useMemo } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useNoteViews } from '@/store/noteViews';
import { useTaskStore } from '@/store/taskStore';
import { notesFocusOf, selectActiveCollectionId, useUIStore } from '@/store/uiStore';
import { getOrderedEndeavours } from '@/utils/collections';
import { getNotePrimaryNotebookId, noteName, type NoteName } from '@/utils/notes';
import { LABELS } from '@/config/labels';
import { browseNotes, groupPath, type NoteGroup, type NoteGroupingId, type NotesBrowse, type NotesFilter } from '@/utils/notesBrowse';

// The one place a Notes view reads the notes from (CLAUDE.md "Notes views"): the browse model
// (utils/notesBrowse.ts) for the current filter and grouping, and the trail to the group you're
// in. A view built on it imports no store; it changes things through services/notesNav.ts.

export interface FilterOption { id: string; label: string; color: string | null }

export interface NotesBrowseView extends NotesBrowse {
  filter:     NotesFilter;
  focusId:    string | null;
  focusPath:  NoteGroup[];   // from the top down to the group you're in (empty: at the top)
  openNoteId: string | null; // the note open in the editor
  lastNoteId: string | null; // the note open now, or the last one opened in Notes
  split:      boolean;       // notes side by side (components/NoteSplitView) rather than one
  // What the filter can choose from (archived ones left out).
  options:    { endeavours: FilterOption[]; purposes: FilterOption[]; tags: FilterOption[] };
  // The Endeavour focus in the header (the one every section shares), which narrows every view.
  headerEndeavourId: string | null;
  // A note's name with its notebook (utils/notes noteName); `hereNotebookId` leaves out the
  // notebook already being looked at.
  nameOf: (noteId: string, hereNotebookId?: string | null) => NoteName;
  // The notebook a note is filed in (its first), or null.
  notebookOf: (noteId: string) => { id: string; name: string; icon: string | null; color: string | null } | null;
}

export function useNotesBrowse(): NotesBrowseView {
  const notes       = useNoteViews();
  const noteTags    = useNoteStore((s) => s.noteTags);
  const collections = useTaskStore((s) => s.collections);
  const purposes    = useTaskStore((s) => s.purposes);
  const filter      = useUIStore((s) => s.notesFilter);
  const grouping    = useUIStore((s) => s.notesGrouping) as NoteGroupingId;
  const focusGroup  = useUIStore((s) => s.notesFocusGroupId);
  const notebook    = useUIStore((s) => s.selectedNoteTagId);
  const openNoteId  = useUIStore((s) => s.editingNoteId);
  const lastNoteId  = useUIStore((s) => s.editingNoteId ?? s.notesLastEditingNoteId);
  const split       = useUIStore((s) => s.noteLayout !== 'single');
  const headerEndeavourId = useUIStore(selectActiveCollectionId);

  const browse = useMemo(() => {
    const applied = headerEndeavourId ? { ...filter, collectionIds: [headerEndeavourId] } : filter;
    return browseNotes({ notes: Object.values(notes), noteTags, collections, purposes, filter: applied }, grouping);
  }, [notes, noteTags, collections, purposes, filter, grouping, headerEndeavourId]);
  const focusId = notesFocusOf({ notesGrouping: grouping, notesFocusGroupId: focusGroup, selectedNoteTagId: notebook });
  const focusPath = useMemo(() => groupPath(browse.roots, focusId), [browse.roots, focusId]);
  const options = useMemo(() => ({
    endeavours: getOrderedEndeavours(collections).map((c) => ({ id: c.id, label: c.name, color: c.color })),
    purposes: Object.values(purposes).filter((p) => !p.archivedAt).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: p.id, label: p.name, color: p.color })),
    tags: Object.values(noteTags).filter((t) => t.kind === 'tag').sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ id: t.id, label: t.name, color: t.color })),
  }), [collections, purposes, noteTags]);
  const nameOf = useMemo(() => (noteId: string, here?: string | null) =>
    noteName(notes[noteId as never] ?? { title: '', tagIds: [] }, noteTags, { untitled: LABELS.notesViews.untitled, here }), [notes, noteTags]);
  const notebookOf = useMemo(() => (noteId: string) => {
    const note = notes[noteId as never];
    const id = note ? getNotePrimaryNotebookId(note, noteTags) : null;
    const t = id ? noteTags[id as keyof typeof noteTags] : undefined;
    return t ? { id: t.id as string, name: t.name, icon: t.icon, color: t.color } : null;
  }, [notes, noteTags]);
  return { ...browse, filter, focusId, focusPath, openNoteId, lastNoteId, split, options, headerEndeavourId, nameOf, notebookOf };
}
