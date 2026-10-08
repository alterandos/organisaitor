// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { undo } from '@tiptap/pm/history';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { NoteTagMark } from './NoteTagMark';
import { ConceptRefMark, collectRefGroups } from './ConceptRef';
import { GlossaryAutolink, forgetPassedOver } from './GlossaryAutolink';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { useNoteStore } from '@/store/noteStore';
import type { NoteId } from '@/types';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
let entryId: string;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  forgetPassedOver();
  const notes = useNoteStore.getState();
  const noteX = notes.addNote({ title: 'Biology' }) as NoteId;
  entryId = notes.addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Eukaryote', fields: { meaning: 'A cell with a nucleus' }, noteId: noteX, collectionId: null });
});
afterEach(() => editor?.destroy());

function make(content = '<p></p>', noteId = 'note-y') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteTagMark, ConceptRefMark, NoteObjectTrigger, GlossaryAutolink],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId, collectionId: null, now: new Date() });
  editor.commands.focus('end');
}
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const press = (key: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))) ?? false;
const chip = () => editor.view.dom.querySelector('[data-autolink-chip]');
const links = () => collectRefGroups(editor.state.doc).map((g) => [g.entryId, editor.state.doc.textBetween(g.from, g.to)]);

describe('linking to the Glossary as you type', () => {
  it('offers the term just typed; Enter links it, and typing carries on normally', () => {
    make();
    type('Every eukaryote');
    expect(chip()?.textContent).toContain('Eukaryote');
    expect(press('Enter')).toBe(true);
    expect(links()).toEqual([[entryId, 'eukaryote']]);
    type(' has a nucleus.');
    expect(editor.state.doc.textContent).toBe('Every eukaryote has a nucleus.');
    expect(links()).toEqual([[entryId, 'eukaryote']]);   // what's typed after isn't part of the link
  });

  it('plurals count; Tab accepts too', () => {
    make();
    type('Eukaryotes');
    expect(press('Tab')).toBe(true);
    expect(links()).toEqual([[entryId, 'Eukaryotes']]);
  });

  it('keeps quiet mid-word, and goes away when you type on', () => {
    make();
    type('eukaryot');
    expect(chip()).toBeNull();
    type('e');
    expect(chip()).not.toBeNull();
    type('s');
    expect(chip()).not.toBeNull();           // eukaryotes
    type('x');
    expect(chip()).toBeNull();
  });

  it('Backspace straight after linking takes the link off (and the offer isn’t made again in this note)', () => {
    make();
    type('A eukaryote');
    press('Enter');
    expect(press('Backspace')).toBe(true);
    expect(links()).toEqual([]);
    expect(editor.state.doc.textContent).toBe('A eukaryote');   // the word stays
    type(' and another eukaryote');
    expect(chip()).toBeNull();
  });

  it('Ctrl+Z undoes the link, not the typing', () => {
    make();
    type('A eukaryote');
    press('Enter');
    undo(editor.state, editor.view.dispatch);
    expect(links()).toEqual([]);
    expect(editor.state.doc.textContent).toBe('A eukaryote');
  });

  it('once per note: not offered again after linking, or after passing it over', () => {
    make();
    type('A eukaryote');
    press('Enter');
    type(' is not another eukaryote');
    expect(chip()).toBeNull();
    editor.destroy();
    make('<p></p>', 'note-z');
    type('eukaryote');
    type(' ');                                // typed on past it: passed over in note-z
    type('then eukaryote');
    expect(chip()).toBeNull();
    editor.destroy();
    make('<p></p>', 'note-w');                // a different note still gets the offer
    type('eukaryote');
    expect(chip()).not.toBeNull();
  });

  it('not inside the term’s own definition', () => {
    make(`<p><mark data-tag-id="builtin-definition" data-tag-type="definition" data-structured-entry-id="${entryId}">Eukaryote</mark></p>`, 'note-x');
    const mark = editor.state.schema.marks.noteTag.create({ tagId: 'builtin-definition', typeKey: 'definition', structuredEntryId: entryId });
    editor.view.dispatch(editor.state.tr.addMark(1, editor.state.doc.content.size - 1, mark));
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    editor.view.dispatch(editor.state.tr.insertText('s'));
    expect(chip()).toBeNull();
  });
});
