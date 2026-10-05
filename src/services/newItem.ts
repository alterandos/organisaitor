import { useUIStore, type AppView } from '@/store/uiStore';

// N / Space / Ctrl+N: open the "new …" pane for where you are. Most sections have one obvious
// thing to create (Records and Lists pick by what's selected). In Notes it follows the focused
// column: the Chronicle tree makes a notebook inside the selected one; the notes list (or the
// editor, via Ctrl+N) makes a note.
export function openNewItem(view: AppView): void {
  const ui = useUIStore.getState();
  if (view === 'overview') ui.showAddOverview();
  else if (view === 'calendar') ui.showAddCalendarItem();
  else if (view === 'portfolio') ui.showAddWatchlistItem();
  else if (view === 'lists') { if (ui.activeListId) ui.showAddListItem(ui.activeListId); else ui.showAddList(); }
  else if (view === 'notes') {
    if (ui.notesFocusedColumn === 'tree') ui.showAddNoteTag(ui.selectedNoteTagId, 'area');
    else ui.showAddNote();
  }
  else if (view === 'fitness') ui.showAddActivity();
  else if (view === 'records') {
    if (ui.activeTrackerId) ui.showAddEntry(ui.activeTrackerId);
    else if (ui.activeRoutineId) ui.showAddEntry(ui.activeRoutineId);
    else ui.showAddTracker();
  } else ui.showAddTask();
}
