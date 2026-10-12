// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { NoteTagMark } from './NoteTagMark';
import { GlossaryCardExtensions, cardWidth, insertCardAfter, setGlossaryCardWidth, snapCardWidth } from './GlossaryCard';
import { AcronymOffer } from './AcronymOffer';
import { NoteBlockSelect } from './blockDesigns';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { glossaryEntries } from '@/services/glossary';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import type { NoteId, StructuredTagEntryId } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
let noteId: NoteId;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  noteId = useNoteStore.getState().addNote({ title: 'Biology' }) as NoteId;
});
afterEach(() => editor?.destroy());

async function make(content = '<p></p>') {
  const element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteTagMark, NoteObjectTrigger, ...GlossaryCardExtensions, AcronymOffer, NoteBlockSelect],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId, collectionId: null, now: new Date() });
  editor.commands.focus('end');
  // The setup's focus('end') lands a frame later; let it, so it doesn't take focus back.
  await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
  await flush();
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const press = (key: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))) ?? false;
const cards = () => { const out: { pos: number; entryId: string }[] = []; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'glossaryCard') out.push({ pos, entryId: n.attrs.entryId }); }); return out; };
const entry = (id: string) => useNoteStore.getState().structuredTagEntries[id as StructuredTagEntryId];
const entries = () => Object.values(useNoteStore.getState().structuredTagEntries);

describe('Glossary cards', () => {
  it.each(['definition', 'acronym', 'concept'])('`\\%s` makes a record in this note and a card that points at it', async (kind) => {
    await make();
    type(`\\${kind} `);
    await flush();
    expect(cards()).toHaveLength(1);
    const made = entry(cards()[0].entryId);
    expect(made).toMatchObject({ typeKey: kind, noteId, term: '' });
    expect(entries()).toHaveLength(1);
  });

  it('the cursor lands in the new card\'s term once it is drawn, and a key typed on a selected card goes there, never replacing it', async () => {
    await make();
    type('\\definition ');
    await flush();
    const term = () => editor.view.dom.querySelector('[data-type="glossary-card"] input') as HTMLInputElement;
    expect(document.activeElement).toBe(term());
    editor.commands.setNodeSelection(cards()[0].pos);
    expect(press('O')).toBe(true);
    await flush();
    expect(cards()).toHaveLength(1);
    expect(document.activeElement).toBe(term());
  });

  it('Ctrl+Enter in a card saves what was typed and puts the cursor in the text after it', async () => {
    await make();
    type('\\definition ');
    await flush();
    const term = editor.view.dom.querySelector('[data-type="glossary-card"] input') as HTMLInputElement;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(term, 'Osmosis');
      term.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { term.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })); });
    expect(entry(cards()[0].entryId).term).toBe('Osmosis');
    const sel = editor.state.selection;
    expect(sel.$from.parent.type.name).toBe('paragraph');
    expect(sel.from).toBeGreaterThan(cards()[0].pos);
  });

  it('Split shows the term, a rule and the meaning; links show as links', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'Water moving across a membrane', weblinks: ['https://www.example.org/osmosis'] }, noteId, collectionId: null });
    await make(`<div data-type="glossary-card" data-entry-id="${id}" data-variant="split"></div>`);
    const card = () => editor.view.dom.querySelector('[data-type="glossary-card"]')!;
    expect(card().querySelector('[class*="splitRule"]')).not.toBeNull();
    expect([...card().querySelectorAll('input, textarea')].map((i) => (i as HTMLInputElement).value)).toEqual(['Osmosis', 'Water moving across a membrane']);
    editor.view.dispatch(editor.state.tr.setNodeMarkup(cards()[0].pos, undefined, { ...editor.state.doc.nodeAt(cards()[0].pos)!.attrs, variant: 'card' }));
    await flush();
    const link = card().querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toBe('example.org/osmosis');
    expect(link.getAttribute('href')).toBe('https://www.example.org/osmosis');
  });

  it('width: Standard for a Card, the column for Split and Compact, unless set; a drag snaps to the nearest width', () => {
    expect(cardWidth({ variant: 'card', width: null })).toBe('standard');
    expect(cardWidth({ variant: 'split', width: null })).toBe('full');
    expect(cardWidth({ variant: 'compact', width: 'half' })).toBe('half');
    expect(cardWidth({ variant: 'card', width: 'nonsense' })).toBe('standard');
    // Standard is 26rem (416px).
    expect(snapCardWidth(0.3, 960)).toBe('third');
    expect(snapCardWidth(0.95, 960)).toBe('full');
    expect(snapCardWidth(0.62, 1600)).toBe('half');
    expect(snapCardWidth(0.25, 1600)).toBe('standard');   // 416 / 1600 = 0.26
  });

  it('a set width is stored on the card and round-trips', async () => {
    await make('<div data-type="glossary-card" data-entry-id="e1"></div>');
    setGlossaryCardWidth(editor.view, cards()[0].pos, 'half');
    expect(editor.getHTML()).toContain('data-card-width="half"');
    editor.commands.setContent(editor.getHTML());
    expect(editor.state.doc.nodeAt(cards()[0].pos)!.attrs.width).toBe('half');
    expect(editor.view.dom.querySelector('[data-type="glossary-card"]')!.getAttribute('data-card-width-shown')).toBe('half');
  });

  it('a record with no term yet is not listed in the Glossary; once named it is', async () => {
    await make();
    type('\\definition ');
    await flush();
    expect(glossaryEntries()).toEqual([]);
    useNoteStore.getState().updateStructuredTagEntry(cards()[0].entryId as StructuredTagEntryId, { term: 'Osmosis', fields: { meaning: 'Water moving across a membrane' } });
    expect(glossaryEntries().map((e) => e.term)).toEqual(['Osmosis']);
  });

  it('the card shows the record, and changes to the record show on the card', async () => {
    await make();
    type('\\definition ');
    await flush();
    const id = cards()[0].entryId as StructuredTagEntryId;
    await act(async () => { useNoteStore.getState().updateStructuredTagEntry(id, { term: 'Osmosis', fields: { meaning: 'Water moving across a membrane' } }); });
    const card = editor.view.dom.querySelector('[data-type="glossary-card"]')!;
    const inputs = [...card.querySelectorAll('input, textarea')] as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(expect.arrayContaining(['Osmosis', 'Water moving across a membrane']));
  });

  it('only the node\'s id, design and frame are stored in the note; they round-trip through JSON and HTML', async () => {
    await make('<div data-type="glossary-card" data-entry-id="e1" data-variant="compact" data-outlined="true"></div>');
    const json = editor.getJSON();
    const html = editor.getHTML();
    for (const content of [json, html]) {
      editor.commands.setContent(content);
      expect(editor.state.doc.nodeAt(cards()[0].pos)!.attrs).toMatchObject({ entryId: 'e1', variant: 'compact', outlined: true });
    }
  });

  it('a card whose record was deleted says so', async () => {
    await make('<div data-type="glossary-card" data-entry-id="gone"></div>');
    expect(editor.view.dom.querySelector('[data-type="glossary-card"]')!.textContent).toContain('deleted');
  });

  it('"Show as a card" on marked text adds a card for the same record after its paragraph', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'm' }, noteId, collectionId: null });
    await make(`<p><span data-tag-id="builtin-definition" data-structured-entry-id="${id}">Osmosis</span> is…</p>`);
    const tr = insertCardAfter(editor.state, 2, id);
    editor.view.dispatch(tr!);
    expect(cards().map((c) => c.entryId)).toEqual([id]);
    expect(editor.state.doc.textContent).toContain('Osmosis is…');
    expect(entries()).toHaveLength(1);
  });

  it('copies as "term — meaning"', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'acronym', tagId: 'builtin-acronym', term: 'ABC', fields: { expansion: 'Australian Broadcasting Corporation' }, noteId, collectionId: null });
    await make(`<div data-type="glossary-card" data-entry-id="${id}"></div>`);
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('ABC — Australian Broadcasting Corporation');
  });

  it('"where it\'s defined" finds a card when no text is marked', () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'concept', tagId: 'builtin-concept', term: 'Entropy', fields: {}, noteId, collectionId: null });
    const content = JSON.stringify({ type: 'doc', content: [{ type: 'glossaryCard', attrs: { entryId: id } }] });
    useNoteStore.setState((st) => ({ notes: { ...st.notes, [noteId]: { ...st.notes[noteId], content } } }));
    openNotePassage(noteId, definitionPassage(id));
    expect(useUIStore.getState().requestedNotePassage).toMatchObject({ noteId, node: 'glossaryCard', attr: 'entryId', value: id });
  });
});

describe('recording an acronym as you type', () => {
  it('closing "Long form (ABC)" offers it; Enter records it and marks the acronym', async () => {
    await make();
    type('We watched the Australian Broadcasting Corporation (ABC');
    expect(editor.view.dom.querySelector('[data-autolink-chip]')).toBeNull();
    type(')');
    expect(editor.view.dom.querySelector('[data-autolink-chip]')?.textContent).toContain('ABC');
    expect(press('Enter')).toBe(true);
    const made = entries();
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ typeKey: 'acronym', term: 'ABC', fields: { expansion: 'Australian Broadcasting Corporation' }, noteId });
    let marked = '';
    editor.state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.attrs.structuredEntryId === made[0].id)) marked += n.text; });
    expect(marked).toBe('ABC');
    expect(editor.state.doc.textContent).toBe('We watched the Australian Broadcasting Corporation (ABC)');
  });

  it('typing on passes the offer over, and it is not offered again in this note', async () => {
    await make();
    type('Australian Stock Exchange (ASX)');
    type(' is open.');
    expect(editor.view.dom.querySelector('[data-autolink-chip]')).toBeNull();
    type(' Again: Australian Stock Exchange (ASX)');
    expect(editor.view.dom.querySelector('[data-autolink-chip]')).toBeNull();
    expect(entries()).toEqual([]);
  });

  it('not offered when the letters don\'t come from the words, or the acronym is already in the Glossary', async () => {
    useNoteStore.getState().addStructuredTagEntry({ typeKey: 'acronym', tagId: 'builtin-acronym', term: 'ASX', fields: {}, noteId, collectionId: null });
    await make();
    type('Some other words (XYZ)');
    expect(editor.view.dom.querySelector('[data-autolink-chip]')).toBeNull();
    type(' Australian Stock Exchange (ASX)');
    expect(editor.view.dom.querySelector('[data-autolink-chip]')).toBeNull();
  });
});
