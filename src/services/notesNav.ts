import { useUIStore } from '@/store/uiStore';
import type { NotesViewId } from '@/config/noteViews';
import type { NoteGroupingId, NotesFilter } from '@/utils/notesBrowse';

// What a Notes view does (CLAUDE.md "Notes views"): open a note, go into a group, change the
// filter, the grouping or the view. Views built on the browse model (hooks/useNotesBrowse.ts)
// act only through here, never on a store, so they stay swappable and every view behaves alike.

export const notesNav = {
  openNote:    (noteId: string) => useUIStore.getState().openNote(noteId),
  // Back to the level the note was opened from (a history stop, so Alt+→ returns to the note).
  closeNote:   () => useUIStore.getState().closeNote(),
  // Going into a group is a history stop in a view with zoom levels (config/noteViews historyStops).
  focusGroup:  (groupId: string | null) => {
    const ui = useUIStore.getState();
    if (ui.editingNoteId) ui.closeNote();
    useUIStore.getState().setNotesFocus(groupId);
  },
  setFilter:   (filter: NotesFilter) => useUIStore.getState().setNotesFilter(filter),
  setGrouping: (grouping: NoteGroupingId) => useUIStore.getState().setNotesGrouping(grouping),
  setView:     (view: NotesViewId) => useUIStore.getState().setNotesView(view),
  back:        () => useUIStore.getState().navigateBack(),
};
