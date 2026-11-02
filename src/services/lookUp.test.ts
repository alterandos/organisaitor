// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { act } from '@testing-library/react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { noteEditorExtensions } from '@/components/NoteEditor/noteEditorExtensions';
import { SENT_TO_GLOSSARY } from '@/services/glossary';
import { allPassages, embedHere, linkHere, noteSchema, passageText } from './lookUp';
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
  useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: name, fields: { meaning: 'Water across a membrane', [SENT_TO_GLOSSARY]: true }, noteId, collectionId: null });
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
