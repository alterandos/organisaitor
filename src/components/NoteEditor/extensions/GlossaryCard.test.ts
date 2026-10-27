// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { NoteTagMark } from './NoteTagMark';
import { ConceptRefMark } from './ConceptRef';
import { moveFromBlock } from './blockDesigns';
import { GlossaryCardExtensions, cardFromSelection, cardWidth, insertCardAfter, morePillSide, sendCardToGlossary } from './GlossaryCard';
import { setBlockWidth, snapBlockWidth } from './blockWidth';
import { useTrashStore } from '@/store/trashStore';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { AcronymOffer } from './AcronymOffer';
import { LINGER_MS } from './typingOffer';
import { registerLiveNoteEditor } from '@/services/liveNoteEditor';
import { defineInItsNote } from '@/test/glossaryFixtures';
import { NoteBlockSelect } from './blockDesigns';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { glossaryEntries } from '@/services/glossary';
import { glossaryTerms } from './GlossaryAutolink';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import type { NoteId, StructuredTagEntryId } from '@/types';

const asked = vi.hoisted(() => ({ answer: true, count: 0, detail: '' as string | undefined }));
vi.mock('@/components/ConfirmDialog/dialogs', () => ({
  confirmDelete: async (_noun: string, _name: string, detail?: string) => { asked.count++; asked.detail = detail; return asked.answer; },
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
  asked.answer = true;
  asked.count = 0;
});
afterEach(() => { registerLiveNoteEditor(null); editor?.destroy(); });

async function make(content = '<p></p>') {
  const element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteTagMark, ConceptRefMark, NoteObjectTrigger, ...GlossaryCardExtensions, AcronymOffer, NoteBlockSelect],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId, collectionId: null, now: new Date() });
  registerLiveNoteEditor({ noteId, tabId: null, view: editor.view });
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
// A card's fields: formatted ones are contentEditable, the web addresses a textarea.
const fieldsIn = (card: Element) => [...card.querySelectorAll('[data-card-input]')] as HTMLElement[];
const textOf = (el: HTMLElement) => (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : el.textContent ?? '');
const typeInto = (el: HTMLElement, text: string) => act(async () => { el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true })); });

describe('Glossary cards', () => {
  it.each(['definition', 'acronym', 'concept', 'profile'])('`\\%s` makes a record in this note and a card that points at it', async (kind) => {
    await make();
    type(`\\${kind} `);
    await flush();
    expect(cards()).toHaveLength(1);
    const made = entry(cards()[0].entryId);
    expect(made).toMatchObject({ typeKey: kind, noteId, term: '' });
    expect(entries()).toHaveLength(1);
  });

  it('a profile shows its facts as label / value rows', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'profile', tagId: 'builtin-profile', term: 'Golden eagle', fields: { summary: 'A large bird of prey', facts: [{ label: 'Family', value: 'Accipitridae' }, { label: 'Wingspan', value: '1.8–2.3 m' }] }, noteId, collectionId: null });
    await make(`<div data-type="glossary-card" data-entry-id="${id}"></div>`);
    await flush();
    const dl = editor.view.dom.querySelector('[data-type="glossary-card"] dl');
    expect([...(dl?.querySelectorAll('dt') ?? [])].map((e) => e.textContent)).toEqual(['Family', 'Wingspan']);
    expect([...(dl?.querySelectorAll('dd') ?? [])].map((e) => e.textContent)).toEqual(['Accipitridae', '1.8–2.3 m']);
  });

  it('Enter makes a new line in a card; a finished "Name: value" line becomes a field of that name, or fills an empty one the card has', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'Water moving across a membrane' }, noteId, collectionId: null });
    await make(`<div data-type="glossary-card" data-entry-id="${id}"></div>`);
    await flush();
    const meaning = editor.view.dom.querySelector('[data-type="glossary-card"] [data-field="meaning"] [data-card-input]') as HTMLElement;
    meaning.focus();
    meaning.innerHTML = 'Water moving across a membrane<br>Origin: Greek, a push';
    meaning.dispatchEvent(new Event('input', { bubbles: true }));
    const enter = (el: HTMLElement, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }));
    expect(enter(meaning)).toBe(false);   // handled in the card, never by the note
    await flush();
    expect(entry(id)?.fields.facts).toEqual([{ label: 'Origin', value: 'Greek, a push' }]);
    expect(meaning.textContent).toBe('Water moving across a membrane');
    expect(cards()).toHaveLength(1);

    meaning.innerHTML = 'Water moving across a membrane<br>Example: Roots take up water';
    meaning.dispatchEvent(new Event('input', { bubbles: true }));
    meaning.blur();
    await flush();
    expect(entry(id)?.fields.example).toBe('Roots take up water');
    expect(entry(id)?.fields.facts).toEqual([{ label: 'Origin', value: 'Greek, a push' }]);
  });

  it('Shift+Enter in any field: another card of the same kind; Enter in the term goes to the next field', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'Water moving' }, noteId, collectionId: null });
    await make(`<div data-type="glossary-card" data-entry-id="${id}"></div>`);
    await flush();
    const inputs = () => [...editor.view.dom.querySelectorAll<HTMLElement>('[data-type="glossary-card"] [data-card-input]')];
    inputs()[0].focus();
    inputs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(inputs()[1]);
    inputs()[0].focus();
    inputs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    await flush();
    expect(cards()).toHaveLength(2);
    expect(entry(cards()[1].entryId)?.typeKey).toBe('definition');
  });

  it('the cursor lands in the new card\'s term once it is drawn, and a key typed on a selected card goes there, never replacing it', async () => {
    await make();
    type('\\definition ');
    await flush();
    const term = () => editor.view.dom.querySelector('[data-type="glossary-card"] [data-card-input]') as HTMLElement;
    expect(document.activeElement).toBe(term());
    editor.commands.setNodeSelection(cards()[0].pos);
    expect(press('O')).toBe(true);
    await flush();
    expect(cards()).toHaveLength(1);
    expect(document.activeElement).toBe(term());
  });

  it('Ctrl+Enter in a card saves what was typed and leaves it onto a new line', async () => {
    await make();
    type('\\definition ');
    await flush();
    const term = editor.view.dom.querySelector('[data-type="glossary-card"] [data-card-input]') as HTMLElement;
    await typeInto(term, 'Osmosis');
    await act(async () => { term.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })); });
    expect(entry(cards()[0].entryId).term).toBe('Osmosis');
    const sel = editor.state.selection;
    expect(sel.$from.parent.type.name).toBe('paragraph');
    expect(sel.$from.parent.textContent).toBe('');
    expect(sel.from).toBeGreaterThan(cards()[0].pos);
  });

  it('a Split card from before reads as Compact: the kind\'s icon, the term, a rule, the meaning; links show as links', async () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'Water moving across a membrane', weblinks: ['https://www.example.org/osmosis'] }, noteId, collectionId: null });
    await make(`<div data-type="glossary-card" data-entry-id="${id}" data-variant="split"></div>`);
    const card = () => editor.view.dom.querySelector('[data-type="glossary-card"]')!;
    expect(editor.state.doc.nodeAt(cards()[0].pos)!.attrs.variant).toBe('compact');
    expect(card().querySelector('[class*="compactIcon"]')?.textContent).toBe('📖');
    expect(card().querySelector('[class*="compactLead"] [class*="compactIcon"]')).not.toBeNull();
    expect(fieldsIn(card()).map(textOf)).toEqual(['Osmosis', 'Water moving across a membrane']);
    editor.view.dispatch(editor.state.tr.setNodeMarkup(cards()[0].pos, undefined, { ...editor.state.doc.nodeAt(cards()[0].pos)!.attrs, variant: 'card' }));
    await flush();
    const link = card().querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toBe('example.org/osmosis');
    expect(link.getAttribute('href')).toBe('https://www.example.org/osmosis');
  });

  it('width: Fit the text for a Card, the column for Compact, unless set; a drag is free, snapping near the named widths', () => {
    expect(cardWidth({ variant: 'card', width: null })).toBe('auto');
    expect(cardWidth({ variant: 'compact', width: null })).toBe('full');
    expect(cardWidth({ variant: 'compact', width: 'half' })).toBe('half');
    expect(cardWidth({ variant: 'card', width: '42%' })).toBe('42%');
    expect(cardWidth({ variant: 'card', width: 'nonsense' })).toBe('auto');
    expect(cardWidth({ variant: 'card', width: '3%' })).toBe('15%');        // never too narrow to use
    expect(snapBlockWidth(0.32, 960)).toBe('third');                         // close to a third
    expect(snapBlockWidth(0.42, 1600)).toBe('42%');                          // nowhere near a stop: free
    expect(snapBlockWidth(0.98, 960)).toBe('full');
    expect(snapBlockWidth(0.51, 1600)).toBe('half');
    expect(snapBlockWidth(0.74, 1600)).toBe('75%');
    expect(snapBlockWidth(0.26, 1600)).toBe('standard');   // 416 / 1600 = 0.26, nearer than a quarter
  });

  it('a dragged width is stored as a share and drawn through --block-w', async () => {
    await make('<div data-type="glossary-card" data-entry-id="e1"></div>');
    setBlockWidth(editor.view, cards()[0].pos, '42%');
    const dom = editor.view.dom.querySelector('[data-type="glossary-card"]') as HTMLElement;
    expect(dom.getAttribute('data-block-width-shown')).toBe('custom');
    expect(dom.style.getPropertyValue('--block-w')).toBe('42%');
    setBlockWidth(editor.view, cards()[0].pos, 'auto');
    expect(editor.state.doc.nodeAt(cards()[0].pos)!.attrs.width).toBeNull();
  });

  it('the picture’s width and place are kept on the card and round-trip', async () => {
    await make('<div data-type="glossary-card" data-entry-id="e1" data-image-width="180" data-image-place="right"></div>');
    expect(editor.state.doc.nodeAt(cards()[0].pos)!.attrs).toMatchObject({ imageWidth: 180, imagePlace: 'right' });
    await make('<div data-type="glossary-card" data-entry-id="e1" data-image-place="sideways"></div>');
    expect(editor.state.doc.nodeAt(cards()[0].pos)!.attrs).toMatchObject({ imageWidth: null, imagePlace: 'flow' });
    expect(editor.getHTML()).not.toContain('data-image-place');
  });

  it('a set width is stored on the card and round-trips', async () => {
    await make('<div data-type="glossary-card" data-entry-id="e1"></div>');
    setBlockWidth(editor.view, cards()[0].pos, 'half');
    expect(editor.getHTML()).toContain('data-block-width="half"');
    editor.commands.setContent(editor.getHTML());
    expect(editor.state.doc.nodeAt(cards()[0].pos)!.attrs.width).toBe('half');
    expect(editor.view.dom.querySelector('[data-type="glossary-card"]')!.getAttribute('data-block-width-shown')).toBe('half');
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
    expect(fieldsIn(card).map(textOf)).toEqual(expect.arrayContaining(['Osmosis', 'Water moving across a membrane']));
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

describe('adding fields and more cards', () => {
  const keyOn = (el: Element, key: string, init: KeyboardEventInit = {}) =>
    act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })); });
  const cardEls = () => [...editor.view.dom.querySelectorAll('[data-type="glossary-card"]')];
  async function oneCard(variant = 'card') {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'Water moving across a membrane' }, noteId, collectionId: null });
    await make(`<div data-type="glossary-card" data-entry-id="${id}" data-variant="${variant}" data-card-width="half"></div><p>after</p>`);
    return id;
  }

  it('the fields not on the card yet are pills beside it, and the same choices are in the pill\'s "+ Add"', async () => {
    await oneCard();
    const more = cardEls()[0].querySelector('[data-card-more]')!;
    const names = [...more.querySelectorAll('button')].map((b) => b.textContent);
    expect(names.length).toBeGreaterThan(0);
    const add = cardEls()[0].querySelector('[data-card-tool="add"]') as HTMLButtonElement;
    expect(add).not.toBeNull();
    await act(async () => { add.click(); });
    const choice = [...document.querySelectorAll('button')].find((b) => `+ ${b.textContent}` === names[0])!;
    await act(async () => { choice.click(); });
    expect([...cardEls()[0].querySelectorAll('[data-card-more] button')].map((b) => b.textContent)).not.toContain(names[0]);
  });

  it('the pills float on the side with room: right first, then left, else not at all', () => {
    const r = (left: number, right: number, top = 0, bottom = 100) => ({ left, right, top, bottom, width: right - left, height: bottom - top }) as DOMRect;
    const bounds = { left: 0, right: 1000 };
    expect(morePillSide(r(100, 500), 120, bounds, [])).toBe('right');
    expect(morePillSide(r(400, 900), 120, bounds, [])).toBe('left');
    expect(morePillSide(r(100, 500), 120, bounds, [r(520, 900)])).toBe('none');           // a card beside it, no room left either
    expect(morePillSide(r(100, 500), 120, bounds, [r(520, 900, 200, 300)])).toBe('right');  // that card is on another row
    expect(morePillSide(r(0, 1000), 120, bounds, [])).toBe('none');
  });

  it('Shift+Enter in any field makes another card of the same kind, design and width below, its term focused', async () => {
    await oneCard();
    const meaning = cardEls()[0].querySelector('[data-field="meaning"] [data-card-input]')!;
    await keyOn(meaning, 'Enter', { shiftKey: true });
    await flush();
    expect(cards()).toHaveLength(2);
    const made = editor.state.doc.nodeAt(cards()[1].pos)!;
    expect(made.attrs).toMatchObject({ variant: 'card', width: 'half' });
    expect(entry(cards()[1].entryId)).toMatchObject({ typeKey: 'definition', noteId, term: '' });
    expect(document.activeElement).toBe(cardEls()[1].querySelector('[data-card-input]'));
  });

  it('Enter in the new card while it is still empty takes it away again, unasked and not in the Recycling Bin; Esc selects the card before', async () => {
    await oneCard('compact');
    const last = () => cardEls()[cardEls().length - 1];
    await keyOn(last().querySelector('[data-field] [data-card-input]')!, 'Enter', { shiftKey: true });
    await flush();
    const fresh = cards()[1].entryId;
    await keyOn(last().querySelector('[data-card-input]')!, 'Enter');
    await flush();
    expect(cards()).toHaveLength(1);
    expect(entry(fresh)).toBeUndefined();
    expect(asked.count).toBe(0);
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
    expect(editor.state.selection.$from.parent.textContent).toBe('after');

    await keyOn(last().querySelector('[data-field] [data-card-input]')!, 'Enter', { shiftKey: true });
    await flush();
    await keyOn(last().querySelector('[data-card-input]')!, 'Escape');
    await flush();
    expect(cards()).toHaveLength(1);
    expect(editor.state.selection.from).toBe(cards()[0].pos);
  });

  it('Enter moves to the next field, and from the last on to the text after the card', async () => {
    await oneCard();
    const [term, meaning] = fieldsIn(cardEls()[0]);
    term.focus();
    await keyOn(term, 'Enter');
    expect(document.activeElement).toBe(meaning);
    await keyOn(meaning, 'Enter');
    expect(editor.state.selection.$from.parent.textContent).toBe('after');
  });

  it('the arrows move between fields at their edges, then out of the card; arrowing in lands in a field', async () => {
    await oneCard();
    const [term, meaning] = fieldsIn(cardEls()[0]);
    term.focus();
    await keyOn(term, 'ArrowDown');                // a one-line field: down is the next field
    expect(document.activeElement).toBe(meaning);
    meaning.focus();
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(meaning);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    await keyOn(meaning, 'ArrowRight');            // at its end: out of the card, into the text after
    expect(editor.state.selection.$from.parent.textContent).toBe('after');
    // From the start of the text after, ArrowLeft goes back in, at the end of the last field.
    const $after = editor.state.selection.$from;
    editor.commands.setTextSelection($after.start());
    expect(press('ArrowLeft')).toBe(true);
    await flush();
    expect(document.activeElement).toBe(fieldsIn(cardEls()[0]).at(-1));
  });

  it('between two cards there is a place for the cursor: arrows stop there, Enter starts a line there', async () => {
    const one = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'Water' }, noteId, collectionId: null });
    const two = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Diffusion', fields: { meaning: 'Spreading' }, noteId, collectionId: null });
    await make(`<div data-type="glossary-card" data-entry-id="${one}"></div><div data-type="glossary-card" data-entry-id="${two}"></div><p>after</p>`);
    // Leaving the first card forwards (what an arrow past its last field does) stops in the gap.
    // (Checked through the keys in a browser: jsdom's DOM selection replaces a gap cursor on focus.)
    moveFromBlock(editor.view, cards()[0].pos, true);
    expect(editor.state.selection).toBeInstanceOf(GapCursor);
    expect(editor.state.selection.from).toBe(cards()[1].pos);
    expect(press('ArrowDown')).toBe(true);       // on into the next card
    await flush();
    expect(document.activeElement).toBe(fieldsIn(cardEls()[1])[0]);
    editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(cards()[1].pos))));
    expect(press('Enter')).toBe(true);
    const between = editor.state.doc.resolve(cards()[1].pos).nodeBefore;
    expect(between?.type.name).toBe('paragraph');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('formatting typed in a field is kept for the card, and read plain everywhere else', async () => {
    await oneCard();
    const [term, meaning] = fieldsIn(cardEls()[0]);
    await act(async () => { term.innerHTML = 'H<sub>2</sub>O'; term.dispatchEvent(new Event('input', { bubbles: true })); term.focus(); term.blur(); });
    await act(async () => { meaning.innerHTML = 'It is <b>wet</b> <span style="color:red">and</span> <img src=x onerror=alert(1)>'; meaning.dispatchEvent(new Event('input', { bubbles: true })); meaning.focus(); meaning.blur(); });
    const saved = entry(cards()[0].entryId);
    expect(saved.term).toBe('H2O');
    expect(saved.fields.termRich).toBe('H<sub>2</sub>O');
    expect(saved.fields.meaning).toMatch(/^It is <b>wet<\/b> and &lt;img /);
    expect(saved.fields.meaning).not.toMatch(/<img/);
    expect(glossaryEntries().find((e) => e.id === saved.id)?.meaning).toMatch(/^It is wet and <img /);
    expect(cardEls()[0].querySelector('img')).toBeNull();
  });

  it('once something is typed in the new card, Enter and Esc keep it', async () => {
    await oneCard();
    await keyOn(cardEls()[0].querySelector('[data-field="meaning"] [data-card-input]')!, 'Enter', { shiftKey: true });
    await flush();
    const term = cardEls()[1].querySelector('[data-card-input]') as HTMLElement;
    await typeInto(term, 'Diffusion');
    await keyOn(term, 'Enter');
    await keyOn(term, 'Escape');
    await flush();
    expect(cards()).toHaveLength(2);
    expect(entry(cards()[1].entryId).term).toBe('Diffusion');
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
    let linked = '';
    editor.state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.type.name === 'conceptRef' && m.attrs.entryId === made[0].id)) linked += n.text; });
    expect(linked).toBe('ABC');
    expect(cards()).toEqual([expect.objectContaining({ entryId: made[0].id })]);
    expect(editor.state.doc.nodeAt(cards()[0].pos)!.attrs.variant).toBe('compact');
    expect(editor.state.doc.textContent).toContain('We watched the Australian Broadcasting Corporation (ABC)');
  });

  const chipEl = () => editor.view.dom.querySelector('[data-autolink-chip]');

  it('an Acronym card whose long form is already a record offers to add itself there; that card shows instead, the empty record goes', async () => {
    const defId = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'definition', term: 'Australian Securities Exchange', fields: { meaning: 'The main stock exchange' }, noteId, collectionId: null });
    defineInItsNote(defId);
    const acrId = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'acronym', tagId: 'acronym', term: 'ASX', fields: { expansion: 'australian securities exchange' }, noteId, collectionId: null });
    await make(`<div data-type="glossary-card" data-entry-id="${acrId}"></div>`);
    const button = [...editor.view.dom.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Add ASX to it'));
    expect(button).toBeDefined();
    await act(async () => { button!.click(); });
    await flush();
    expect(cards()[0].entryId).toBe(defId);
    expect(useNoteStore.getState().structuredTagEntries[acrId as never]).toBeUndefined();
    expect(useNoteStore.getState().structuredTagEntries[defId as never].fields).toMatchObject({ acronym: 'ASX' });
  });

  it('when the long form is already a record, the offer adds the acronym to it: one record, linked by either name', async () => {
    const defId = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'definition', term: 'Australian Broadcasting Corporation', fields: { meaning: 'A broadcaster' }, noteId, collectionId: null });
    defineInItsNote(defId);
    await make();
    type('We watched the Australian Broadcasting Corporation (ABC)');
    expect(chipEl()?.textContent).toContain('Add ABC to');
    expect(press('Enter')).toBe(true);
    expect(entries()).toHaveLength(1);
    expect(entries()[0].fields).toMatchObject({ acronym: 'ABC' });
    let linked = '';
    editor.state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.type.name === 'conceptRef' && m.attrs.entryId === defId)) linked += n.text; });
    expect(linked).toBe('ABC');
    const listed = glossaryEntries().find((e) => e.id === defId)!;
    expect(listed.kinds).toEqual(['definition', 'acronym']);
    expect(glossaryTerms().filter((t) => t.entryId === defId).map((t) => t.term).sort()).toEqual(['ABC', 'Australian Broadcasting Corporation']);
    // Typed again, it's a name the Glossary has: no second offer to record it.
    type(' and ABC (Australian Broadcasting Corporation)');
    expect(chipEl()?.textContent ?? '').not.toContain('Record');
  });

  it('every pattern detection knows is offered as you type, with what it stands for', async () => {
    await make();
    type('ASX - Australian Stock Exchange ');
    expect(chipEl()?.textContent).toContain('Australian Stock Exchange');
    expect(press('Enter')).toBe(true);
    expect(entries()[0]).toMatchObject({ term: 'ASX', fields: { expansion: 'Australian Stock Exchange' } });
  });

  it('typing on past the offer leaves it lingering above the text: Tab still accepts it, Enter is a new line', async () => {
    await make();
    type('Australian Stock Exchange (ASX)');
    type(' is open');
    expect(chipEl()).toHaveProperty('dataset.lingering', '');
    expect(chipEl()?.textContent).toContain('Tab');
    expect(press('Tab')).toBe(true);
    expect(entries()[0]).toMatchObject({ term: 'ASX' });
    expect(editor.state.doc.textContent).toBe('Australian Stock Exchange (ASX) is open');
  });

  it('Enter while an offer lingers is just a new line: nothing recorded, and the offer goes with the line', async () => {
    await make();
    type('Australian Stock Exchange (ASX)');
    type(' is open');
    press('Enter');
    expect(entries()).toEqual([]);
    expect(editor.state.doc.firstChild!.childCount).toBe(2);
    expect(chipEl()).toBeNull();
  });

  it('a lingering offer goes when its words change, when Esc passes it over, or when its time is up; then not again in this note', async () => {
    await make();
    type('Australian Stock Exchange (ASX)');
    type(' is');
    press('Escape');
    expect(chipEl()).toBeNull();
    type(' Again: Australian Stock Exchange (ASX)');
    expect(chipEl()).toBeNull();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      type(' Then the Australian Broadcasting Corporation (ABC)');
      type(' on');
      expect(chipEl()).not.toBeNull();
      vi.advanceTimersByTime(LINGER_MS + 10);
      expect(chipEl()).toBeNull();
      type(' and the Australian Broadcasting Corporation (ABC)');
      expect(chipEl()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    expect(entries()).toEqual([]);
  });

  it('not offered when the letters don\'t come from the words, or the acronym is already in the Glossary', async () => {
    defineInItsNote(useNoteStore.getState().addStructuredTagEntry({ typeKey: 'acronym', tagId: 'builtin-acronym', term: 'ASX', fields: {}, noteId, collectionId: null }));
    await make();
    type('Some other words (XYZ)');
    expect(editor.view.dom.querySelector('[data-autolink-chip]')).toBeNull();
    type(' Australian Stock Exchange (ASX)');
    expect(editor.view.dom.querySelector('[data-autolink-chip]')).toBeNull();
  });
});

describe('making and deleting definitions', () => {
  const linksIn = (id: string) => { let n = 0; editor.state.doc.descendants((x) => { if (x.isText && x.marks.some((m) => m.type.name === 'conceptRef' && m.attrs.entryId === id)) n++; }); return n; };

  it('selected words make a card (marking text as a definition is retired): the term worked out, the words linked to it', async () => {
    await make('<p>Plants make sugar by photosynthesis every day.</p>');
    const text = editor.state.doc.textContent;
    const from = 2 + text.indexOf('photosynthesis');
    cardFromSelection(editor.view, from, from + 'photosynthesis'.length, 'definition', { noteId, collectionId: null, now: new Date() });
    await flush();
    const made = entries();
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ typeKey: 'definition', term: 'photosynthesis' });
    expect(cards()).toEqual([expect.objectContaining({ entryId: made[0].id })]);
    expect(linksIn(made[0].id)).toBe(1);
  });

  it('deleting the card of a definition asks first; confirmed, the record and every link to it go (the text stays), in other notes too', async () => {
    await make('<p>Plants use photosynthesis.</p>');
    const from = 2 + editor.state.doc.textContent.indexOf('photosynthesis');
    cardFromSelection(editor.view, from, from + 14, 'definition', { noteId, collectionId: null, now: new Date() });
    await flush();
    const id = entries()[0].id;
    const other = useNoteStore.getState().addNote({ title: 'Chemistry' }) as NoteId;
    useNoteStore.getState().updateNote(other, { content: JSON.stringify({ type: 'doc', content: [{ type: 'section', attrs: { columns: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'see photosynthesis', marks: [{ type: 'conceptRef', attrs: { entryId: id, typeKey: 'definition' } }] }] }] }] }) });
    editor.view.dispatch(editor.state.tr.delete(cards()[0].pos, cards()[0].pos + 1));
    expect(cards()).toHaveLength(1);   // held back until answered
    await flush();
    expect(asked.count).toBe(1);
    expect(asked.detail).toMatch(/2 places link to it/);
    expect(cards()).toHaveLength(0);
    expect(entries()).toEqual([]);
    expect(linksIn(id)).toBe(0);
    expect(editor.state.doc.textContent).toContain('Plants use photosynthesis.');
    expect(useNoteStore.getState().notes[other].content).not.toContain(id);
    expect(useNoteStore.getState().notes[other].content).toContain('see photosynthesis');
  });

  it('Send to Glossary: the card goes, the term stays linked, the record stays listed; removing the link never asks', async () => {
    await make('<p>Plants use photosynthesis.</p>');
    const from = 2 + editor.state.doc.textContent.indexOf('photosynthesis');
    cardFromSelection(editor.view, from, from + 14, 'definition', { noteId, collectionId: null, now: new Date() });
    await flush();
    const id = entries()[0].id;
    const before = linksIn(id);
    expect(sendCardToGlossary(editor.view, cards()[0].pos)).toBe(true);
    await flush();
    expect(cards()).toHaveLength(0);
    expect(asked.count).toBe(0);
    expect(linksIn(id)).toBe(before + 1);   // the term, linked where the card was
    useNoteStore.getState().updateNote(noteId, { content: JSON.stringify(editor.getJSON()) });
    expect(glossaryEntries().map((e) => e.id)).toEqual([id]);
    // Take every link out: the record stays in the Glossary, nothing asked.
    editor.commands.setContent('<p>Nothing here.</p>');
    useNoteStore.getState().updateNote(noteId, { content: JSON.stringify(editor.getJSON()) });
    await flush();
    expect(asked.count).toBe(0);
    expect(glossaryEntries().map((e) => e.id)).toEqual([id]);
  });

  it('cancelled, nothing changes; a cut card is not asked about (it is being moved)', async () => {
    await make();
    type('\\definition ');
    await flush();
    useNoteStore.getState().updateStructuredTagEntry(cards()[0].entryId as never, { term: 'Osmosis' });
    asked.answer = false;
    editor.view.dispatch(editor.state.tr.delete(cards()[0].pos, cards()[0].pos + 1));
    await flush();
    expect(asked.count).toBe(1);
    expect(cards()).toHaveLength(1);
    expect(entries()).toHaveLength(1);
    editor.view.dispatch(editor.state.tr.delete(cards()[0].pos, cards()[0].pos + 1).setMeta('uiEvent', 'cut'));
    await flush();
    expect(asked.count).toBe(1);
    expect(cards()).toHaveLength(0);
    expect(entries()).toHaveLength(1);
  });

  it('a record whose definition is no longer in its note is not offered, listed or linkable', async () => {
    await make();
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Osmosis', fields: { meaning: 'm' }, noteId, collectionId: null });
    expect(glossaryEntries().map((e) => e.id)).not.toContain(id);
    defineInItsNote(id);
    expect(glossaryEntries().map((e) => e.id)).toContain(id);
  });
});
