// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ArtifactLinkMark } from '@/components/NoteEditor/extensions/ArtifactLinkMark';
import { editNoteContent, editNoteText } from './noteContentEdit';
import { registerLiveNoteEditor } from './liveNoteEditor';
import { deleteTaskWithCleanup } from './crossAppLinkCleanup';
import { useNoteStore } from '@/store/noteStore';
import { useTaskStore } from '@/store/taskStore';
import type { NoteId } from '@/types';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor | null = null;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
});
afterEach(() => { registerLiveNoteEditor(null); editor?.destroy(); editor = null; });

const doc = (text: string) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const textOf = (json: string) => JSON.parse(json).content[0].content?.[0]?.text ?? '';

function open(noteId: string, tabId: string | null, content: string) {
  editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, ArtifactLinkMark], content: JSON.parse(content) });
  registerLiveNoteEditor({ noteId, tabId, view: editor.view });
  return editor;
}

const upper = {
  inEditor: () => false,
  inJson: (json: string) => doc(textOf(json).toUpperCase()),
};

describe('editNoteContent: changing a note from outside its editor', () => {
  it('a note that isn’t open: the stored JSON is changed (main tab and a tab)', () => {
    const id = useNoteStore.getState().addNote({ title: 'N', content: doc('main') });
    const tabId = useNoteStore.getState().addNoteTab(id, 'Tab');
    useNoteStore.getState().updateNoteTabContent(id, tabId, doc('tab'));
    expect(editNoteContent(id, null, upper)).toBe(true);
    expect(editNoteContent(id, tabId, upper)).toBe(true);
    const note = useNoteStore.getState().notes[id];
    expect(textOf(note.content)).toBe('MAIN');
    expect(textOf(note.tabs[0].content)).toBe('TAB');
  });

  it('a note open in the editor: the change goes through the editor, not behind its back', () => {
    const id = useNoteStore.getState().addNote({ title: 'N', content: doc('main') });
    const ed = open(id, null, doc('main'));
    const changed = editNoteContent(id, null, {
      inEditor: (tr) => { tr.insertText('!', tr.doc.content.size - 1); return true; },
      inJson: () => { throw new Error('the stored copy must not be written while the editor has it open'); },
    });
    expect(changed).toBe(true);
    expect(ed.state.doc.textContent).toBe('main!');
  });

  it('only the open tab goes through the editor; another tab of the same note is stored', () => {
    const id = useNoteStore.getState().addNote({ title: 'N', content: doc('main') });
    const tabId = useNoteStore.getState().addNoteTab(id, 'Tab');
    useNoteStore.getState().updateNoteTabContent(id, tabId, doc('tab'));
    open(id, null, doc('main'));
    expect(editNoteContent(id, tabId, upper)).toBe(true);
    expect(textOf(useNoteStore.getState().notes[id].tabs[0].content)).toBe('TAB');
  });

  it('nothing to change, or no such note: false, and nothing written', () => {
    const id = useNoteStore.getState().addNote({ title: 'N', content: doc('main') });
    const before = useNoteStore.getState().notes[id];
    expect(editNoteContent(id, null, { inEditor: () => true, inJson: () => null })).toBe(false);
    expect(editNoteContent('missing', null, upper)).toBe(false);
    expect(useNoteStore.getState().notes[id]).toBe(before);
  });

  it('editNoteText writes the change once, for the stored copy too (with the editor’s schema)', () => {
    const id = useNoteStore.getState().addNote({ title: 'N', content: doc('main') });
    const { schema } = new Editor({ extensions: [StarterKit] });
    expect(editNoteText(id, null, schema, (tr) => { tr.insert(5, schema.text('?')); return true; })).toBe(true);
    expect(textOf(useNoteStore.getState().notes[id].content)).toBe('main?');
  });
});

describe('a deleted task’s link leaves an open note through its editor', () => {
  it('the mark goes from the editor’s text, so its next save can’t put it back', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const taskId = useTaskStore.getState().addTask({ title: 'T', crossAppRefs: [{ type: 'note', id: noteId }] });
    const linked = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'see this', marks: [{ type: 'artifactLink', attrs: { targetType: 'task', targetId: taskId } }] },
    ] }] });
    useNoteStore.getState().updateNote(noteId as NoteId, { content: linked });
    const ed = open(noteId, null, linked);
    deleteTaskWithCleanup(taskId);
    let marked = false;
    ed.state.doc.descendants((n) => { if (n.marks.some((m) => m.type.name === 'artifactLink')) marked = true; });
    expect(marked).toBe(false);
    expect(ed.state.doc.textContent).toBe('see this');
  });
});
