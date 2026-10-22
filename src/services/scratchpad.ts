import { useNoteStore } from '@/store/noteStore';
import { setStickyContent, stickyDocOf, stickyText, docForText } from '@/services/stickyNotes';
import { noteView } from '@/services/noteSecrets';
import { showToast } from '@/components/Toast/showToast';
import { LABELS } from '@/config/labels';
import { SCRATCHPAD_PRESET } from '@/utils/notes';
import type { Note, NoteId, NoteTag, NoteTagId } from '@/types/notes';

// The scratchpad (2026-10-19): one note for jotting things down for a moment, opened from
// anywhere with Alt+P (or Quick Access, where it's pinned by default) as a panel over the app.
// It's an ordinary note in its own notebook, pinned beside Stickies at the top of Notes, so it
// syncs, is searchable and goes to the Recycling Bin like any note; made the first time it's
// opened, found again by the notebook's presetKey. It holds simple text, like a sticky
// (services/stickyNotes.ts), and keeps its name whatever is written in it.

export function scratchpadNotebook(tags: Record<string, NoteTag>): NoteTag | null {
  const found = Object.values(tags).filter((t) => t.kind === 'area' && t.presetKey === SCRATCHPAD_PRESET);
  found.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return found[0] ?? null;
}

// The scratchpad's note: the oldest one in its notebook still there.
export function scratchpadNote(notes: Record<string, Note>, tags: Record<string, NoteTag>): Note | null {
  const book = scratchpadNotebook(tags);
  if (!book) return null;
  const inBook = Object.values(notes).filter((n) => n.tagIds.includes(book.id) && !n.archivedAt);
  inBook.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return inBook[0] ?? null;
}

export function ensureScratchpad(): NoteId {
  const store = useNoteStore.getState();
  const have = scratchpadNote(store.notes, store.noteTags);
  if (have) return have.id;
  const bookId: NoteTagId = scratchpadNotebook(store.noteTags)?.id
    ?? store.addNoteTag({ name: LABELS.scratchpad.notebook, kind: 'area', icon: '✏️', presetKey: SCRATCHPAD_PRESET });
  return useNoteStore.getState().addNote({ title: LABELS.scratchpad.title, tagIds: [bookId], content: docForText('') });
}

// All its text, as plain lines (what Copy all puts on the clipboard).
export function scratchpadText(note: Note): string {
  const doc = stickyDocOf(noteView(note).content);
  return doc ? stickyText(doc) : '';
}

// Cut all: the text goes to the clipboard and the scratchpad is emptied, with Undo.
export async function cutScratchpad(note: Note): Promise<void> {
  const before = noteView(note).content;
  const text = scratchpadText(note);
  await navigator.clipboard.writeText(text);
  setStickyContent(note.id, stickyDocOf(docForText(''))!, true);
  showToast({
    message: LABELS.scratchpad.cut,
    actions: [{ label: LABELS.swipeActions.undo, onClick: () => { const doc = stickyDocOf(before); if (doc) setStickyContent(note.id, doc, true); } }],
  });
}
