import type { EditorView } from '@tiptap/pm/view';

// The note text open in an editor right now: its note, tab (null = the main tab) and view. A change
// made to a note from outside its editor (Review rescheduling a passage, a sticky note) must go
// through that editor when that text is open, or the editor's next save would write its own copy
// back over the change.
//
// THE registry of open editors (CLAUDE.md "Notes side by side", 2026-10-16): with notes side by
// side several are open at once, one per pane, each registered with registerOpenNoteEditor. The one
// in front (the pane last clicked in, or the only editor) is also registered with
// registerLiveNoteEditor and is what liveNote() returns. Anything that asks "is this note's text
// open?" asks liveNoteEditorFor / liveNoteFor, which look through all of them.

// `flush` saves what's been typed but not saved yet (the editor saves on a short delay).
interface LiveNoteEditor { noteId: string; tabId: string | null; view: EditorView; flush?: () => void }

let front: LiveNoteEditor | null = null;
const open = new Set<LiveNoteEditor>();

export function registerLiveNoteEditor(next: LiveNoteEditor | null): void {
  front = next;
}

// One editor among several (a pane); returns the way to take it off again.
export function registerOpenNoteEditor(entry: LiveNoteEditor): () => void {
  open.add(entry);
  return () => { open.delete(entry); };
}

function all(): LiveNoteEditor[] {
  const out = front && !front.view.isDestroyed ? [front] : [];
  for (const e of open) if (!e.view.isDestroyed && !out.some((o) => o.view === e.view)) out.push(e);
  return out;
}

export function liveNoteEditorFor(noteId: string, tabId: string | null): EditorView | null {
  return all().find((e) => e.noteId === noteId && e.tabId === tabId)?.view ?? null;
}

// Which note and tab (null = the main tab) a view is showing, if it's an open editor.
export function liveNoteOf(view: EditorView): { noteId: string; tabId: string | null } | null {
  const e = all().find((x) => x.view === view);
  return e ? { noteId: e.noteId, tabId: e.tabId } : null;
}

// The note in front (any tab), for reading its live text.
export function liveNote(): LiveNoteEditor | null {
  return front && !front.view.isDestroyed ? front : null;
}

// The editor showing this note (any tab, any pane), if it's open.
export function liveNoteFor(noteId: string): LiveNoteEditor | null {
  return all().find((e) => e.noteId === noteId) ?? null;
}

// Saves every open editor's unsaved typing now: before anything that remounts editors (changing
// the side-by-side layout), so the new editor loads the latest text rather than the last save.
export function flushOpenNoteEditors(): void {
  for (const e of all()) e.flush?.();
}

// Every open editor.
export function liveNotes(): LiveNoteEditor[] {
  return all();
}
