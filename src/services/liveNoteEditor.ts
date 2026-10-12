import type { EditorView } from '@tiptap/pm/view';

// The note text open in the editor right now, if any: its note, tab (null = the main tab) and
// view. A change made to a note from outside the editor (Review rescheduling a passage) must go
// through the editor when that text is open, or the editor's next save would write its own copy
// back over the change. Registered by NoteEditor.

interface LiveNoteEditor { noteId: string; tabId: string | null; view: EditorView }

let live: LiveNoteEditor | null = null;

export function registerLiveNoteEditor(next: LiveNoteEditor | null): void {
  live = next;
}

export function liveNoteEditorFor(noteId: string, tabId: string | null): EditorView | null {
  if (!live || live.view.isDestroyed || live.noteId !== noteId || live.tabId !== tabId) return null;
  return live.view;
}

// Which note and tab (null = the main tab) a view is showing, if it's the registered editor.
export function liveNoteOf(view: EditorView): { noteId: string; tabId: string | null } | null {
  if (!live || live.view !== view || view.isDestroyed) return null;
  return { noteId: live.noteId, tabId: live.tabId };
}

// The note open in the editor right now (any tab), for reading its live text.
export function liveNote(): { noteId: string; tabId: string | null; view: EditorView } | null {
  return live && !live.view.isDestroyed ? live : null;
}
