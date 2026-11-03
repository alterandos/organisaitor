import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { addSticky, setStickyContent, stickyDocOf, docForText, type StickyDoc } from '@/services/stickyNotes';
import { ensureScratchpad } from '@/services/scratchpad';
import { deleteNoteWithCleanup } from '@/services/crossAppLinkCleanup';
import { deleteForever, trashedBy } from '@/services/trash';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { showToast } from '@/components/Toast/showToast';
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { addFactFromNote } from '@/services/interestingFacts';
import { addQuoteFromNote } from '@/services/keptQuotes';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types/notes';

// Selected text sent on from a note (2026-11-01): copied, never moved (the user's choice), into the
// scratchpad (at its end, stamped with when it came and from which note) or a new sticky. Both are
// simple text (services/stickyNotes.ts), so it goes as its lines. Text from an encrypted note into
// one that isn't asks first, as Send to inbox does.

const L = LABELS.sendSelection;

// Asked when the text would lose its encryption on the way (a new sticky is never encrypted).
async function mayCopy(fromNoteId: string | null, toEncrypted: boolean): Promise<boolean> {
  const from = fromNoteId ? useNoteStore.getState().notes[fromNoteId as NoteId] : undefined;
  if (from?.isEncrypted && !toEncrypted) return confirmDialog({ title: L.unencryptTitle, message: L.unencryptMessage, confirmLabel: L.unencryptConfirm });
  return true;
}

const lines = (text: string): StickyDoc['content'] =>
  text.split('\n').map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }));

// The stamp after the text: when it was sent, and from which note.
export function sentStamp(at: Date, noteTitle: string | null): string {
  const when = at.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return noteTitle ? L.stampFrom(when, noteTitle) : L.stamp(when);
}

// The scratchpad's content with `text` added at its end (after a blank line, unless it's empty), the
// stamp in italics on the line after it.
export function appendToScratchpadDoc(doc: StickyDoc, text: string, stamp: string): StickyDoc {
  const blank = doc.content.every((p) => !(p.content ?? []).length);
  const stampLine: StickyDoc['content'][number] = { type: 'paragraph', content: [{ type: 'text', text: stamp, marks: [{ type: 'italic' }] }] };
  return { type: 'doc', content: [...(blank ? [] : [...doc.content, { type: 'paragraph' as const }]), ...lines(text), stampLine] };
}

export async function sendToScratchpad(text: string, fromNoteId: string | null): Promise<void> {
  if (!text.trim()) return;
  const padId = ensureScratchpad();
  const pad = useNoteStore.getState().notes[padId];
  if (isNoteLocked(pad)) { await alertDialog(L.locked); return; }
  if (!(await mayCopy(fromNoteId, !!pad.isEncrypted))) return;
  const before = stickyDocOf(noteView(pad).content);
  if (!before) { await alertDialog(LABELS.scratchpad.formatted); return; }
  const from = fromNoteId ? useNoteStore.getState().notes[fromNoteId as NoteId] : undefined;
  setStickyContent(padId, appendToScratchpadDoc(before, text.trim(), sentStamp(new Date(), from ? noteView(from).title || null : null)), true);
  showToast({
    message: L.sentToScratchpad,
    actions: [
      { label: L.open, onClick: () => useUIStore.getState().openScratchpad() },
      { label: LABELS.swipeActions.undo, onClick: () => setStickyContent(padId, before, true) },
    ],
  });
}

export async function turnIntoSticky(text: string, fromNoteId: string | null): Promise<void> {
  if (!text.trim()) return;
  if (!(await mayCopy(fromNoteId, false))) return;
  const id = addSticky();
  const doc = stickyDocOf(docForText(text.trim()));
  if (doc) setStickyContent(id, doc);
  showToast({ message: L.madeSticky, actions: [{ label: LABELS.swipeActions.undo, onClick: () => forget(id) }] });
}

// A sticky made by mistake goes for good, not to the Recycling Bin.
function forget(id: NoteId): void {
  for (const entry of trashedBy(() => deleteNoteWithCleanup(id))) deleteForever(entry);
}

// Into Interesting facts or Quotes: each a Glossary record whose origin is the note, so one from an
// encrypted note is encrypted with it (nothing to ask).
function sendToFacts(text: string, fromNoteId: string | null): void {
  if (text.trim()) addFactFromNote(text, fromNoteId);
}

export type SendTarget = 'scratchpad' | 'sticky' | 'readingList' | 'facts' | 'quotes';

// One function for every menu that offers these (the `\` selection menu, the right-click menu): the
// selected text, as lines, sent on.
export function sendSelectedText(target: SendTarget, text: string, fromNoteId: string | null): void {
  if (target === 'scratchpad') { void sendToScratchpad(text, fromNoteId); return; }
  if (target === 'sticky') { void turnIntoSticky(text, fromNoteId); return; }
  if (target === 'facts') { sendToFacts(text, fromNoteId); return; }
  if (target === 'quotes') { if (text.trim()) addQuoteFromNote(text, fromNoteId); return; }
  const from = fromNoteId ? useNoteStore.getState().notes[fromNoteId as NoteId] : undefined;
  void import('@/services/readingList').then(({ addToReadingList }) => addToReadingList(text, from && !isNoteLocked(from) ? noteView(from).title || null : null));
}
