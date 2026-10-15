import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import type { Node as PMNode } from '@tiptap/pm/model';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { liveNoteFor } from '@/services/liveNoteEditor';
import { contentHasMark, isNodeFind, type PassageFind } from '@/utils/noteContent';
import { MAIN_TAB_ID } from '@/utils/noteTabs';
import type { NoteId } from '@/types';

// Opens a note at a passage found by a mark on it (or by a node: an inbox item), on whichever tab holds it: Notes, the note,
// the tab, then NoteEditor selects the passage and scrolls to it (uiStore.requestedNotePassage).
// The way the Glossary, a concept's margin label, Key points and Review jump to text.
export function openNotePassage(noteId: string, findOrFinds: PassageFind | PassageFind[]): boolean {
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw) return false;
  const note = noteView(raw);
  // Several ways to find it (a term's marked text, else its card): the first the note holds.
  const finds = Array.isArray(findOrFinds) ? findOrFinds : [findOrFinds];
  const contents = [{ id: MAIN_TAB_ID, content: note.content }, ...note.tabs.map((t) => ({ id: t.id, content: t.content }))];
  let tabId = MAIN_TAB_ID;
  let find = finds[0];
  // The open text first: it may hold changes not saved to the store yet.
  const open = liveNoteFor(noteId);
  const inOpen = open ? finds.find((f) => docHasPassage(open.view.state.doc, f)) : undefined;
  if (open && inOpen) { tabId = open.tabId ?? MAIN_TAB_ID; find = inOpen; }
  else outer: for (const f of finds) {
    for (const c of contents) {
      if (contentHasMark(c.content, f)) { tabId = c.id; find = f; break outer; }
    }
  }
  const ui = useUIStore.getState();
  if (ui.activeView !== 'notes') ui.setActiveView('notes');
  ui.closeNoteTagView();
  ui.closeNotesGlossary();
  ui.closeNotesReview();
  ui.closeNotesHubs();
  ui.closeNotesMap();
  ui.openNote(noteId, tabId);
  ui.setRequestedNotePassage({ noteId, ...find });
  return true;
}

// Where a Glossary entry is defined: the passage its structured tag marks, else its card
// (`\definition`, extensions/GlossaryCard.ts), else its chip (extensions/GlossaryChip.ts).
export const definitionPassage = (entryId: string): PassageFind[] => [
  { mark: 'noteTag', attr: 'structuredEntryId', value: entryId },
  { node: 'glossaryCard', attr: 'entryId', value: entryId },
  { node: 'glossaryChip', attr: 'entryId', value: entryId },
];

// Whether a document holds the passage (a node, or text with the mark).
export function docHasPassage(doc: PMNode, find: PassageFind): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (isNodeFind(find)) {
      if (node.type.name === find.node && node.attrs[find.attr] === find.value) found = true;
    } else if (node.isText && node.marks.some((m) => m.type.name === find.mark && m.attrs[find.attr] === find.value)) {
      found = true;
    }
    return !found;
  });
  return found;
}

// Whether a note holds the passage anywhere: in the open editor's text if it's open there (which
// may be ahead of the store), else in its stored tabs. Locked notes can't be read: false.
export function noteHasPassage(noteId: string, find: PassageFind): boolean {
  const open = liveNoteFor(noteId);
  if (open && docHasPassage(open.view.state.doc, find)) return true;
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw || isNoteLocked(raw)) return false;
  const note = noteView(raw);
  return [note.content, ...note.tabs.map((t) => t.content)].some((c) => contentHasMark(c, find));
}
