import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { noteView } from '@/services/noteSecrets';
import { contentHasMark, type PassageMark } from '@/utils/noteContent';
import { MAIN_TAB_ID } from '@/utils/noteTabs';
import type { NoteId } from '@/types';

// Opens a note at a passage found by a mark on it, on whichever tab holds it: Notes, the note,
// the tab, then NoteEditor selects the passage and scrolls to it (uiStore.requestedNotePassage).
// The way the Glossary, a concept's margin label, Key points and Review jump to text.
export function openNotePassage(noteId: string, find: PassageMark): boolean {
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw) return false;
  const note = noteView(raw);
  const tabId = contentHasMark(note.content, find)
    ? MAIN_TAB_ID
    : note.tabs.find((t) => contentHasMark(t.content, find))?.id ?? MAIN_TAB_ID;
  const ui = useUIStore.getState();
  if (ui.activeView !== 'notes') ui.setActiveView('notes');
  ui.closeNoteTagView();
  ui.closeNotesGlossary();
  ui.closeNotesReview();
  ui.openNote(noteId, tabId);
  ui.setRequestedNotePassage({ noteId, ...find });
  return true;
}

// Where a Glossary entry is defined: the passage its structured tag marks.
export const definitionPassage = (entryId: string): PassageMark => ({ mark: 'noteTag', attr: 'structuredEntryId', value: entryId });
