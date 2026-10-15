// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { NoteTagMark } from './NoteTagMark';
import { ConceptRefMark } from './ConceptRef';
import { NoteBlockSelect } from './blockDesigns';
import { GlossaryCardExtensions } from './GlossaryCard';
import { GlossaryChipExtensions, cardToChip, chipKey, chipToCard, closeChip, toggleChip } from './GlossaryChip';
import { NoteListItem } from './ListItem';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';
import { registerLiveNoteEditor } from '@/services/liveNoteEditor';
import { glossaryEntries } from '@/services/glossary';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import type { NoteId, StructuredTagEntryId } from '@/types';

const asked = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/ConfirmDialog/dialogs', () => ({
  confirmDelete: async () => { asked.count++; return true; },
  confirmDialog: async () => true,
}));

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
  asked.count = 0;
});
afterEach(() => { registerLiveNoteEditor(null); editor?.destroy(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function make(content: string, cursorAt?: (doc: Editor['state']['doc']) => number) {
  const element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: [StarterKit.configure({ document: false, listItem: false }), NoteListItem, SectionDocument, Section, ColumnBlock, Column, NoteTagMark, ConceptRefMark, NoteObjectTrigger, ...GlossaryCardExtensions, ...GlossaryChipExtensions, NoteBlockSelect],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId, collectionId: null, now: new Date() });
  registerLiveNoteEditor({ noteId, tabId: null, view: editor.view });
  editor.commands.focus('end');
  await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
  if (cursorAt) editor.commands.setTextSelection(cursorAt(editor.state.doc));
  await flush();
}
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const nodes = (name: string) => { const out: { pos: number; entryId: string; parent: string }[] = []; editor.state.doc.descendants((n, pos, parent) => { if (n.type.name === name) out.push({ pos, entryId: n.attrs.entryId, parent: parent?.type.name ?? '' }); }); return out; };
const chips = () => nodes('glossaryChip');
const cards = () => nodes('glossaryCard');
const openChips = () => chipKey.getState(editor.state)?.open ?? [];
const entry = (id: string) => useNoteStore.getState().structuredTagEntries[id as StructuredTagEntryId];
// The empty paragraph inside the last list item.
const inLastItem = (doc: Editor['state']['doc']) => { let at = 0; doc.descendants((n, pos, parent) => { if (n.type.name === 'paragraph' && parent?.type.name === 'listItem') at = pos + 1 + n.content.size; }); return at; };

describe('Glossary chips (the Inline design)', () => {
  it('`\\definition` after text on the line goes in as a chip right there, its card open with the term ready', async () => {
    await make('<p>Water moves by</p>');
    type(' \\definition ');
    await flush();
    expect(cards()).toHaveLength(0);
    expect(chips()).toHaveLength(1);
    expect(editor.state.doc.textContent).toBe('Water moves by ');
    expect(entry(chips()[0].entryId)).toMatchObject({ typeKey: 'definition', noteId });
    expect(openChips()).toEqual([chips()[0].pos]);
    const term = editor.view.dom.querySelector('[data-glossary-chip-card] [data-card-input]') as HTMLElement;
    expect(term).toBeTruthy();
    expect(document.activeElement).toBe(term);
  });

  it('on a bullet it goes in as a chip too, empty bullet or not; on an empty line, as the card', async () => {
    await make('<ul><li><p>one</p></li><li><p></p></li></ul>', inLastItem);
    type('\\concept ');
    await flush();
    expect(chips().map((c) => c.parent)).toEqual(['paragraph']);
    expect(cards()).toHaveLength(0);
    editor.destroy();
    await make('<p></p>');
    type('\\concept ');
    await flush();
    expect(cards()).toHaveLength(1);
    expect(chips()).toHaveLength(0);
  });

  it('shows the kind\'s icon, the term and the meaning, and follows the record as it changes', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'Water crossing a membrane' }, noteId, collectionId: null });
    await make(`<p>See <span data-type="glossary-chip" data-entry-id="${id}"></span> here</p>`);
    const chip = () => editor.view.dom.querySelector('[data-type="glossary-chip"]') as HTMLElement;
    expect(chip().querySelector('strong')?.textContent).toBe('Osmosis');
    expect(chip().querySelector('[data-chip-meaning]')?.textContent).toBe('Water crossing a membrane');
    act(() => { useNoteStore.getState().updateStructuredTagEntry(id as never, { term: 'Diffusion' }); });
    expect(chip().querySelector('strong')?.textContent).toBe('Diffusion');
  });

  it('a click opens its card below the line and a click again closes it; nothing about it is stored but the id', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'm' }, noteId, collectionId: null });
    await make(`<p>See <span data-type="glossary-chip" data-entry-id="${id}"></span></p>`);
    const pos = chips()[0].pos;
    act(() => toggleChip(editor.view, pos));
    await flush();
    expect(editor.view.dom.querySelector('[data-glossary-chip-card]')).toBeTruthy();
    act(() => toggleChip(editor.view, pos));
    await flush();
    expect(editor.view.dom.querySelector('[data-glossary-chip-card]')).toBeNull();
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain(`"entryId":"${id}"`);
    expect(json).not.toContain('Osmosis');
    expect(editor.getHTML()).toMatch(new RegExp(`<span[^>]*data-entry-id="${id}"[^>]*data-type="glossary-chip"|<span[^>]*data-type="glossary-chip"[^>]*data-entry-id="${id}"`));
    editor.commands.setContent(editor.getHTML());
    expect(chips()).toMatchObject([{ entryId: id }]);
  });

  it('closing the card puts the cursor after the chip', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: {}, noteId, collectionId: null });
    await make(`<p>See <span data-type="glossary-chip" data-entry-id="${id}"></span> later</p>`);
    const pos = chips()[0].pos;
    act(() => toggleChip(editor.view, pos));
    act(() => closeChip(editor.view, pos));
    expect(openChips()).toEqual([]);
    expect(editor.state.selection.from).toBe(pos + 1);
  });

  it('Inline turns a card into a chip at the end of the line before it, and "Show as a card" turns it back: the same record', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: {}, noteId, collectionId: null });
    await make(`<p>Water moves by</p><div data-type="glossary-card" data-entry-id="${id}"></div>`);
    act(() => cardToChip(editor.view, cards()[0].pos));
    expect(cards()).toHaveLength(0);
    expect(chips()).toMatchObject([{ entryId: id }]);
    expect(editor.state.doc.textContent).toBe('Water moves by ');
    act(() => chipToCard(editor.view, chips()[0].pos));
    expect(chips()).toHaveLength(0);
    expect(cards()).toMatchObject([{ entryId: id }]);
    expect(editor.state.doc.firstChild?.firstChild?.textContent).toBe('Water moves by');
    await flush();
    expect(asked.count).toBe(0);
    expect(entry(id)).toBeDefined();
  });

  it('a chip counts as where the term is defined: listed in the Glossary, copied as its term, and deleting the last one asks', async () => {
    await make('<p>Water moves by</p>');
    type(' \\definition ');
    await flush();
    const id = chips()[0].entryId;
    useNoteStore.getState().updateStructuredTagEntry(id as never, { term: 'Osmosis' });
    expect(glossaryEntries().map((e) => e.id)).toContain(id);
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toContain('Water moves by Osmosis');
    const pos = chips()[0].pos;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + 1));
    await flush();
    expect(asked.count).toBe(1);
  });
});
