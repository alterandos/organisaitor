import { Transform } from '@tiptap/pm/transform';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { useNoteStore } from '@/store/noteStore';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { liveNoteEditorFor } from '@/services/liveNoteEditor';
import { MAIN_TAB_ID } from '@/utils/noteTabs';
import { log, errorMessage } from '@/utils/log';
import type { NoteId } from '@/types';

// THE way to change a note's text from outside the editor showing it (CLAUDE.md "Single entry
// points"). If that note and tab are open in the editor, the change must go through the editor's
// transaction: the editor saves its own copy of the text, and a change written to the store behind
// its back would be overwritten by that save. Otherwise the stored JSON is changed and written back
// through the store, which re-encrypts an encrypted note. A locked note can't be changed.
//
// A caller gives both halves of its change: `inEditor` on the open editor's transaction, `inJson`
// on the stored JSON string (return the new string, or null for no change). A caller that has the
// editor's schema can use editNoteText instead and write the change once.

export interface NoteContentEdit {
  inEditor: (tr: Transaction) => boolean;     // false: change nothing
  inJson:   (json: string) => string | null;  // null: change nothing
}

export interface EditNoteOptions {
  addToHistory?: boolean;   // false: Ctrl+Z in the open editor won't take this back on its own
}

const normalTab = (tabId: string | null | undefined) => (!tabId || tabId === MAIN_TAB_ID ? null : tabId);

// Returns whether anything changed.
export function editNoteContent(noteId: string, tabId: string | null | undefined, edit: NoteContentEdit, options: EditNoteOptions = {}): boolean {
  const tab = normalTab(tabId);
  const live = liveNoteEditorFor(noteId, tab);
  if (live) {
    const tr = live.state.tr;
    if (!edit.inEditor(tr) || !tr.docChanged) return false;
    if (options.addToHistory === false) tr.setMeta('addToHistory', false);
    live.dispatch(tr);
    return true;
  }
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw || isNoteLocked(raw)) return false;
  const note = noteView(raw);
  const json = tab ? note.tabs.find((t) => t.id === tab)?.content : note.content;
  if (json === undefined) return false;
  const out = edit.inJson(json);
  if (out === null || out === json) return false;
  if (tab) useNoteStore.getState().updateNoteTabContent(noteId as NoteId, tab, out);
  else useNoteStore.getState().updateNote(noteId as NoteId, { content: out });
  return true;
}

// editNoteContent for a caller that has the editor's schema: the change is written once, as steps
// on a transform, and applied to whichever document applies (the open editor's, or the stored one
// read with `schema`). `edit` returns false to change nothing.
export function editNoteText(
  noteId: string,
  tabId: string | null | undefined,
  schema: Schema,
  edit: (tr: Transform) => boolean,
  options: EditNoteOptions = {},
): boolean {
  return editNoteContent(noteId, tabId, {
    inEditor: (tr) => edit(tr),
    inJson: (json) => {
      let doc: PMNode;
      try {
        doc = json ? schema.nodeFromJSON(JSON.parse(json)) : schema.topNodeType.createAndFill()!;
      } catch (e) {
        log.warn('noteContentEdit', 'could not read the note to change it', errorMessage(e));
        return null;
      }
      const tr = new Transform(doc);
      return edit(tr) && tr.docChanged ? JSON.stringify(tr.doc.toJSON()) : null;
    },
  }, options);
}
