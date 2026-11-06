// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { act } from '@testing-library/react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { noteEditorExtensions } from '@/components/NoteEditor/noteEditorExtensions';
import { allPassages, embedHere, linkHere, noteSchema, passageDoc, passageText } from './lookUp';
import { searchPassages } from '@/utils/notePassages';

let editor: Editor;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  editor = new Editor({ extensions: noteEditorExtensions({ noteEncrypted: () => null, linkClass: '' }), content: { type: 'doc', content: [{ type: 'section', content: [{ type: 'paragraph' }] }] } });
});
// Cards draw a moment later (a React root each): let them, then take the editor down.
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
afterEach(async () => { await flush(); editor.destroy(); await flush(); });

const termNamed = (name: string) => {
  const noteId = useNoteStore.getState().addNote({ title: 'Biology' });
  useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: name, fields: { meaning: 'Water across a membrane' }, noteId, collectionId: null });
  return searchPassages(allPassages(noteSchema()), name)[0];
};

describe('Look up: Glossary terms', () => {
  it('a term is found, and copies as "term: meaning"', () => {
    const p = termNamed('Osmosis');
    expect(p.kind).toBe('term');
    expect(passageText(p, noteSchema())).toBe('Osmosis: Water across a membrane');
  });

  it('Insert card here puts its card in the note; Link here puts its name in, linked', async () => {
    const p = termNamed('Osmosis');
    const here = { noteId: 'n', tabId: null, view: editor.view };
    embedHere(p, here);
    const cards: string[] = [];
    editor.state.doc.descendants((n) => { if (n.type.name === 'glossaryCard') cards.push(n.attrs.entryId); });
    expect(cards).toEqual([p.term!.entryId]);
    await flush();
    editor.commands.setContent({ type: 'doc', content: [{ type: 'section', content: [{ type: 'paragraph' }] }] });
    editor.commands.setTextSelection(2);
    linkHere(p, here);
    let linked = '';
    editor.state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.type.name === 'conceptRef')) linked += n.text; });
    expect(linked).toBe('Osmosis');
  });
});

describe('Look up: old notes', () => {
  // A note saved before sections has its blocks straight under the document: read as the editor
  // reads it (one section), never as an invalid document (it crashed the preview, 2026-11-05).
  it('a note with no sections is read, and its passages found', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Old' });
    useNoteStore.getState().updateNote(noteId, { content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Coefficient of determination' }] }] }) });
    const found = searchPassages(allPassages(noteSchema()), 'determination');
    expect(found.map((p) => p.text)).toContain('Coefficient of determination');
    expect(() => passageDoc(found[0], noteSchema())!.check()).not.toThrow();
  });
});
