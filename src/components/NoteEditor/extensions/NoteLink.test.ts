// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { BlockIds } from './BlockIds';
import { NoteLinkExtensions, applyNoteLink, unlinkNoteLinkAt } from './NoteLink';
import { NoteEmbedExtensions, copyEmbedAsText, insertEmbedAt } from './NoteEmbed';
import { NoteBlockSelect } from './blockDesigns';
import { NoteObjectTrigger, objectTriggerStorage, type NoteLinkRequest } from '../objects/NoteObjectTrigger';
import { registerLiveNoteEditor } from '@/services/liveNoteEditor';
import { ensureBlockId, linkTarget, noteDocFor } from '@/services/noteLinkTargets';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { linksToNote, mentionRange, passageRange, passagesOf, unlinkedMentions } from '@/utils/noteLinks';
import type { NoteId } from '@/types';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

const EXTENSIONS = [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, BlockIds, ...NoteLinkExtensions, ...NoteEmbedExtensions, NoteBlockSelect];

let editor: Editor;
let noteId: string;
let requests: NoteLinkRequest[];

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  requests = [];
});
afterEach(() => { registerLiveNoteEditor(null); editor?.destroy(); });

// A stored note with `html` as its content (read through a throwaway editor with the same schema).
function storedNote(title: string, html: string): string {
  const id = useNoteStore.getState().addNote({ title });
  const tmp = new Editor({ element: document.createElement('div'), extensions: EXTENSIONS, content: html });
  useNoteStore.getState().updateNote(id as NoteId, { content: JSON.stringify(tmp.getJSON()) });
  tmp.destroy();
  return id;
}

// The note being edited, open in the editor (registered as the live one, as NoteEditor does).
function make(content = '<p></p>') {
  noteId = useNoteStore.getState().addNote({ title: 'Here' });
  editor = new Editor({ element: document.createElement('div'), extensions: EXTENSIONS, content });
  objectTriggerStorage(editor).getContext = () => ({ noteId, collectionId: null, now: new Date() });
  objectTriggerStorage(editor).openNoteLinkPicker = (r) => { requests.push(r); };
  registerLiveNoteEditor({ noteId, tabId: null, view: editor.view });
}
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
function select(text: string) {
  let from = -1;
  editor.state.doc.descendants((n, pos) => { if (from < 0 && n.isText && n.text!.includes(text)) from = pos + n.text!.indexOf(text); });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + text.length)));
}
const linked = () => {
  const out: { text: string; attrs: Record<string, unknown> }[] = [];
  editor.state.doc.descendants((n) => { const m = n.marks.find((x) => x.type.name === 'noteLink'); if (n.isText && m) out.push({ text: n.text!, attrs: m.attrs }); });
  return out;
};

describe('note links', () => {
  it('`[[` opens the link picker where it was typed, and takes the brackets back out', () => {
    make();
    type('See [[');
    expect(editor.state.doc.textContent).toBe('See ');
    const at = editor.state.selection.from;
    expect(requests).toEqual([{ purpose: 'link', from: at, to: at }]);
  });

  it('`[[` in code is just brackets', () => {
    make('<p><code>x</code></p>');
    editor.commands.setTextSelection(3);
    type('[[');
    expect(requests).toEqual([]);
  });

  it('`\\ref` (or `\\notelink`) opens the link picker; `\\embed` opens it to embed', () => {
    make();
    type('\\ref ');
    expect(requests.at(-1)?.purpose).toBe('link');
    expect(editor.state.doc.textContent).toBe('');
    type('\\embed ');
    expect(requests.at(-1)?.purpose).toBe('embed');
  });

  it('links the selected words, or puts the name in as the link when nothing is selected', () => {
    const target = storedNote('Photosynthesis', '<p>Light becomes sugar.</p>');
    make('<p>Plants make food.</p>');
    select('make food');
    const { from, to } = editor.state.selection;
    applyNoteLink(editor.view, from, to, { noteId: target, tabId: null, blockId: null, name: 'Photosynthesis' });
    expect(linked()).toEqual([{ text: 'make food', attrs: { noteId: target, tabId: null, blockId: null } }]);

    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const at = editor.state.selection.from;
    applyNoteLink(editor.view, at, at, { noteId: target, tabId: null, blockId: 'B1', name: 'Light' });
    expect(linked().map((l) => l.text)).toEqual(['make food', 'Light']);
    type(' more');
    expect(linked().map((l) => l.text)).toEqual(['make food', 'Light']);

    // It survives HTML (copy and paste) and JSON.
    const html = editor.getHTML();
    expect(html).toContain('data-note-link');
    editor.commands.setContent(html);
    expect(linked().map((l) => l.attrs.blockId)).toEqual([null, 'B1']);

    select('make');
    unlinkNoteLinkAt(editor.view, editor.state.selection.from + 1);
    expect(linked().map((l) => l.text)).toEqual(['Light']);
  });

  it('a click opens the note at the passage', () => {
    const target = storedNote('Cells', '<h2 data-block-id="B9">Membranes</h2><p>Lipids.</p>');
    make('<p>go</p>');
    select('go');
    applyNoteLink(editor.view, editor.state.selection.from, editor.state.selection.to, { noteId: target, tabId: null, blockId: 'B9', name: '' });
    const inLink = editor.state.selection.from + 1;
    const el = editor.view.dom.querySelector('a[data-note-link]') as HTMLElement;
    const click = (ctrlKey: boolean) => ({ target: el, ctrlKey, metaKey: false, preventDefault: () => {} }) as unknown as MouseEvent;
    editor.view.someProp('handleClick', (f) => f(editor.view, inLink, click(false)));
    expect(useUIStore.getState().requestedNotePassage).toMatchObject({ noteId: target, attr: 'blockId', value: 'B9' });
    // Ctrl+click selects the linked words instead, as for a web link.
    editor.view.someProp('handleClick', (f) => f(editor.view, inLink, click(true)));
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('go');
  });
});

describe('passages', () => {
  it('a passage keeps its id; a copied one loses it', () => {
    make('<p data-block-id="P1">One</p><p>Two</p>');
    const json = editor.getJSON();
    editor.commands.setContent({ ...json, content: [...json.content!, json.content![0]] });
    const ids: unknown[] = [];
    editor.state.doc.descendants((n) => { if (n.type.name === 'paragraph') ids.push(n.attrs.blockId); });
    expect(ids).toEqual(['P1', null, null, null]);
  });

  it('splitting a passage leaves its id on the first half', () => {
    make('<p data-block-id="P1">OneTwo</p>');
    select('Two');
    editor.commands.setTextSelection(editor.state.selection.from);
    editor.commands.splitBlock();
    const ids: unknown[] = [];
    editor.state.doc.descendants((n) => { if (n.type.name === 'paragraph') ids.push(n.attrs.blockId); });
    expect(ids).toEqual(['P1', null]);
  });

  it('gives a passage in another note a lasting id the first time it is linked, and reads it back', () => {
    const target = storedNote('Cells', '<h2>Membranes</h2><p>Lipids.</p><h2>Nucleus</h2><p>DNA.</p>');
    make();
    const doc = noteDocFor(target, null, editor.schema)!;
    const heading = passagesOf(doc).find((p) => p.text === 'Membranes')!;
    const id = ensureBlockId(target, null, heading.pos, editor.schema)!;
    expect(id).toBeTruthy();
    expect(ensureBlockId(target, null, heading.pos, editor.schema)).toBe(id);
    const preview = linkTarget(target, null, id, editor.schema);
    expect(preview.state).toBe('ok');
    expect(preview.heading).toBe('Membranes');
    expect(preview.fragment.map((n) => n.textContent)).toEqual(['Membranes', 'Lipids.']);
    expect(linkTarget(target, null, 'gone', editor.schema).state).toBe('missing-passage');
    expect(linkTarget('nope', null, null, editor.schema).state).toBe('missing-note');
  });
});

describe('embedded passages', () => {
  it('shows the passage as it reads now, and follows changes to it', () => {
    const target = storedNote('Cells', '<p data-block-id="Q1">Lipids make membranes.</p>');
    make('<p></p>');
    const tr = insertEmbedAt(editor.state, editor.state.selection.from, { noteId: target, tabId: null, blockId: 'Q1' })!;
    editor.view.dispatch(tr);
    const dom = () => editor.view.dom.querySelector('[data-type="note-embed"]') as HTMLElement;
    expect(dom().textContent).toContain('Lipids make membranes.');
    expect(dom().textContent).toContain('Cells');

    const tmp = new Editor({ element: document.createElement('div'), extensions: EXTENSIONS, content: '<p data-block-id="Q1">Lipids and proteins make membranes.</p>' });
    useNoteStore.getState().updateNote(target as NoteId, { content: JSON.stringify(tmp.getJSON()) });
    tmp.destroy();
    expect(dom().textContent).toContain('Lipids and proteins make membranes.');

    // Round trip: the block holds only where the passage is.
    const html = editor.getHTML();
    expect(html).toContain('data-embed-block="Q1"');
    editor.commands.setContent(html);
    expect(dom()).toBeTruthy();
  });

  it('says so when the passage has gone', () => {
    const target = storedNote('Cells', '<p>Other.</p>');
    make('<p></p>');
    editor.view.dispatch(insertEmbedAt(editor.state, editor.state.selection.from, { noteId: target, tabId: null, blockId: 'X' })!);
    expect(editor.view.dom.querySelector('[data-type="note-embed"]')!.textContent).toContain('no longer in the note');
  });

  it('"Copy as text here" turns it into an ordinary copy', () => {
    const target = storedNote('Cells', '<p data-block-id="Q1">Lipids.</p>');
    make('<p></p>');
    editor.view.dispatch(insertEmbedAt(editor.state, editor.state.selection.from, { noteId: target, tabId: null, blockId: 'Q1' })!);
    let pos = -1;
    editor.state.doc.descendants((n, p) => { if (n.type.name === 'noteEmbed') pos = p; });
    copyEmbedAsText(editor, pos);
    let embeds = 0;
    const ids: unknown[] = [];
    editor.state.doc.descendants((n) => { if (n.type.name === 'noteEmbed') embeds++; if (n.type.name === 'paragraph' && n.textContent === 'Lipids.') ids.push(n.attrs.blockId); });
    expect(embeds).toBe(0);
    expect(ids).toEqual([null]);
  });
});

describe('what links to a note, and where it is mentioned', () => {
  it('finds links with their sentence, and mentions that are not linked yet', () => {
    const target = storedNote('Photosynthesis', '<p>x</p>');
    const a = storedNote('Plants', `<p>Plants use <a data-note-link="${target}">it</a> daily.</p>`);
    const b = storedNote('Leaves', '<p>Leaves do photosynthesis in light.</p>');
    storedNote('Roots', '<p>Nothing here.</p>');
    const notes = Object.values(useNoteStore.getState().notes);
    expect(linksToNote(notes, target)).toEqual([{ fromNoteId: a, fromTitle: 'Plants', tabId: null, text: 'it', context: 'Plants use it daily.' }]);
    expect(unlinkedMentions(notes, target, 'Photosynthesis').map((m) => [m.noteId, m.context])).toEqual([[b, 'Leaves do photosynthesis in light.']]);
    expect(unlinkedMentions(notes, target, 'Pho')).toEqual([]);

    make('<p>Leaves do photosynthesis in light.</p>');
    const r = mentionRange(editor.state.doc, 'Photosynthesis')!;
    expect(editor.state.doc.textBetween(r.from, r.to)).toBe('photosynthesis');
  });

  it("a heading's passage is its section", () => {
    make('<h2>A</h2><p>a1</p><h3>A.1</h3><p>a2</p><h2>B</h2><p>b</p>');
    const doc = editor.state.doc;
    const a = passagesOf(doc)[0];
    const { from, to } = passageRange(doc, a.pos);
    expect(doc.textBetween(from, to, '|')).toBe('A|a1|A.1|a2');
  });
});
