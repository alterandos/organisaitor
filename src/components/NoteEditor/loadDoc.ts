import type { Content, Editor } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';

// THE way a note editor loads a document (another note, another tab, a note unlocked, a sticky's
// text changed elsewhere): the editor then starts with an empty undo history. Tiptap's setContent
// is an ordinary, undoable step, so with nothing newer to undo Ctrl+Z took the load back and put
// the tab left (another tab, even another note) into this one, which the autosave then wrote over
// it (found 2026-11-13, after a card's kind change: that changes only the record, so Ctrl+Z went
// straight past it to the load). A fresh state with the same plugins resets every plugin's state,
// history included.
export function loadEditorDoc(editor: Editor, content: Content, opts: { emitUpdate?: boolean } = {}): void {
  editor.commands.setContent(content, { emitUpdate: opts.emitUpdate ?? true });
  const { state } = editor;
  editor.view.updateState(EditorState.create({ doc: state.doc, selection: state.selection, plugins: state.plugins }));
}
