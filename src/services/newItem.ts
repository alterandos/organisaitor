import { useUIStore, type AppView } from '@/store/uiStore';
import { useNoteStore } from '@/store/noteStore';
import { STICKIES_PRESET, takesNotes } from '@/utils/notes';
import { addSticky } from '@/services/stickyNotes';
import { useListStore } from '@/store/listStore';
import { glossaryKindOf, newRecordInList } from '@/services/glossaryLists';
import type { ListId } from '@/types/lists';

// N / Space / Ctrl+N: open the "new …" pane for where you are. Most sections have one obvious
// thing to create (Records and Lists pick by what's selected). In Notes it follows the focused
// column: the Chronicle tree makes a notebook inside the selected one; the notes list (or the
// editor, via Ctrl+N) makes a note.
// Endeavours: the page makes an Endeavour; a home makes a task, filed under that Endeavour.
export function openNewItem(view: AppView): void {
  const ui = useUIStore.getState();
  if (view === 'endeavours') { if (ui.endeavourHomeId) ui.showAddTask(); else ui.showAddCollection(); }
  else if (view === 'overview') ui.showAddOverview();
  else if (view === 'calendar') ui.showAddCalendarItem();
  else if (view === 'portfolio') ui.showAddWatchlistItem();
  else if (view === 'lists') {
    // A Glossary list's new row is a new record of its kind (services/glossaryLists.ts).
    const list = ui.activeListId ? useListStore.getState().lists[ui.activeListId as ListId] : undefined;
    if (list && glossaryKindOf(list)) newRecordInList(list.id);
    else if (ui.activeListId) ui.showAddListItem(ui.activeListId); else ui.showAddList();
  }
  else if (view === 'notes') {
    if (ui.notesFocusedColumn === 'tree') ui.showAddNoteTag(selectedTakingNotes(), 'area');
    else addNoteHere();
  }
  else if (view === 'fitness') ui.showAddActivity();
  else if (view === 'records') {
    if (ui.activeTrackerId) ui.showAddEntry(ui.activeTrackerId);
    else if (ui.activeRoutineId) ui.showAddEntry(ui.activeRoutineId);
    else ui.showAddTracker();
  } else ui.showAddTask();
}

// A new note in the selected notebook. Stickies and the Scratchpad take none (utils/notes.ts
// takesNotes): there it's a new sticky, or the scratchpad opened.
export function addNoteHere(): void {
  const ui = useUIStore.getState();
  const tag = ui.selectedNoteTagId ? useNoteStore.getState().noteTags[ui.selectedNoteTagId] : undefined;
  if (tag && !takesNotes(tag)) {
    if (tag.presetKey === STICKIES_PRESET) addSticky(); else ui.openScratchpad();
    return;
  }
  ui.showAddNote();
}

// The selected notebook, if a note or notebook can go in it.
function selectedTakingNotes() {
  const id = useUIStore.getState().selectedNoteTagId;
  const tag = id ? useNoteStore.getState().noteTags[id] : undefined;
  return tag && takesNotes(tag) ? id : null;
}
