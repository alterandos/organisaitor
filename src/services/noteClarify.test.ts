// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { act } from '@testing-library/react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { noteEditorExtensions } from '@/components/NoteEditor/noteEditorExtensions';
import { clarifyRange, clarifySentenceBefore, collectClarify, collectLearned, learnedClarify } from '@/components/NoteEditor/extensions/ClarifyMark';
import { blockFlag, setRecordFlag, toggleBlockFlag } from '@/components/NoteEditor/extensions/BlockFlags';
import { flagRange } from '@/components/NoteEditor/extensions/UnsureFlag';
import { NOTE_BLOCK_NODES } from '@/components/NoteEditor/blockNodes';
import { noteSchema } from './lookUp';
import { clarifyItems, clearClarifyItem } from './noteClarify';
import type { NoteId } from '@/types';

let editor: Editor;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(async () => { await flush(); editor?.destroy(); await flush(); });

const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content: [{ type: 'section', content }] });
const para = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const make = (content: JSONContent) => {
  editor = new Editor({ element: document.createElement('div'), extensions: noteEditorExtensions({ noteEncrypted: () => null, linkClass: '' }), content });
};
const storeNote = (content: unknown) => {
  const id = useNoteStore.getState().addNote({ title: 'Statistics' }) as NoteId;
  useNoteStore.getState().updateNote(id, { content: JSON.stringify(content) });
  return id;
};

describe('Clarify later on text', () => {
  it('marks selected text, and `\\clarify` marks the sentence before', () => {
    make(doc(para('R squared is the share of variance explained. It runs from 0 to 1.')));
    const tr = clarifyRange(editor.state.tr, 2, 11);
    editor.view.dispatch(tr!);
    expect(collectClarify(editor.state.doc).map((r) => editor.state.doc.textBetween(r.from, r.to))).toEqual(['R squared']);
    make(doc(para('It runs from 0 to 1. \\clarify')));
    const end = editor.state.doc.content.size - 2;
    editor.view.dispatch(clarifySentenceBefore(editor.state, end - '\\clarify'.length, end));
    const runs = collectClarify(editor.state.doc);
    expect(runs).toHaveLength(1);
    expect(editor.state.doc.textContent).not.toContain('\\clarify');
  });
});

describe('Clarify later and Not sure of this on a whole block', () => {
  it('a block takes either flag, kept on it; a Glossary card keeps it on its record', async () => {
    const noteId = storeNote(doc(para('x')));
    const entryId = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'formula', tagId: 'builtin-formula', term: 'Coefficient of determination', fields: {}, noteId, collectionId: null });
    make(doc({ type: 'quoteBlock', content: [{ type: 'quoteText', content: [{ type: 'text', text: 'All models are wrong' }] }] }, { type: 'glossaryCard', attrs: { entryId } }, para('after')));
    await flush();
    const at = (name: string) => { let p = -1; editor.state.doc.descendants((n, pos) => { if (p < 0 && n.type.name === name) p = pos; }); return p; };
    expect(NOTE_BLOCK_NODES.has('quoteBlock')).toBe(true);
    toggleBlockFlag(editor.view, at('quoteBlock'), 'clarify');
    expect(blockFlag(editor.state, at('quoteBlock'), 'clarify')).toMatchObject({ id: expect.any(String), note: null });
    expect(editor.getHTML()).toContain('data-flag-clarify');
    toggleBlockFlag(editor.view, at('glossaryCard'), 'unsure');
    expect(blockFlag(editor.state, at('glossaryCard'), 'unsure')).not.toBeNull();
    expect(useNoteStore.getState().structuredTagEntries[entryId as never].fields.unsureOf).toMatchObject({ id: expect.any(String) });
    toggleBlockFlag(editor.view, at('quoteBlock'), 'clarify');
    expect(blockFlag(editor.state, at('quoteBlock'), 'clarify')).toBeNull();
  });
});

describe('the Clarify tool\'s lists', () => {
  it('To learn and To check gather text, blocks and cards from every note; Learned it moves one to Learned, with the date', () => {
    make(doc(para('placeholder')));
    const schema = noteSchema();
    // Build the stored note through the editor, so the marks are real.
    editor.commands.setContent(doc(para('R squared is a share. Slate forms at low heat.'), { type: 'quoteBlock', attrs: { clarify: 'blk1', clarifyNote: 'who said it' }, content: [{ type: 'quoteText', content: [{ type: 'text', text: 'All models are wrong' }] }] }));
    const line = 'R squared is a share. Slate forms at low heat.';
    const at = (t: string) => 2 + line.indexOf(t);
    editor.view.dispatch(clarifyRange(editor.state.tr, at('R squared'), at('R squared') + 9)!);
    editor.view.dispatch(flagRange(editor.state.tr, at('Slate'), at('Slate') + 'Slate forms at low heat'.length)!);
    const noteId = storeNote(editor.getJSON());
    const entryId = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'concept', tagId: 'builtin-concept', term: 'Variance', fields: {}, noteId, collectionId: null });
    setRecordFlag(entryId, 'clarify', { id: 'card1', note: null });

    const { items } = clarifyItems(schema);
    const learn = items.filter((i) => i.list === 'learn');
    expect(learn.map((i) => [i.where, i.text])).toEqual(expect.arrayContaining([['text', 'R squared'], ['block', 'All models are wrong'], ['card', 'Variance']]));
    expect(learn.find((i) => i.where === 'block')?.note).toBe('who said it');
    // each carries its note's Endeavour, which the tool's Endeavour filter reads
    useNoteStore.getState().updateNote(noteId, { collectionId: 'end1' as never });
    expect(clarifyItems(schema).items.filter((i) => i.where !== 'card').every((i) => i.collectionId === 'end1')).toBe(true);
    expect(items.filter((i) => i.list === 'check').map((i) => i.where)).toEqual(['text']);

    clearClarifyItem(learn.find((i) => i.where === 'text')!, schema);
    clearClarifyItem(learn.find((i) => i.where === 'block')!, schema);
    clearClarifyItem(learn.find((i) => i.where === 'card')!, schema);
    const after = clarifyItems(schema).items;
    expect(after.filter((i) => i.list === 'learn')).toEqual([]);
    expect(after.filter((i) => i.list === 'check')).toHaveLength(1);
    expect(useNoteStore.getState().notes[noteId].content).toContain(' is a share. ');   // the words stay
    // kept, with the day it was learned, for study later (2026-11-05)
    const learned = after.filter((i) => i.list === 'learned');
    expect(learned.map((i) => i.where).sort()).toEqual(['block', 'card', 'text']);
    expect(learned.every((i) => i.learnedAt && !Number.isNaN(Date.parse(i.learnedAt)))).toBe(true);
    // Learn again puts it back on To learn
    clearClarifyItem(learned.find((i) => i.where === 'text')!, schema);
    clearClarifyItem(learned.find((i) => i.where === 'block')!, schema);
    clearClarifyItem(learned.find((i) => i.where === 'card')!, schema);
    expect(clarifyItems(schema).items.filter((i) => i.list === 'learn')).toHaveLength(3);
  });

  it('a learned passage or block is no longer drawn as to clarify, and keeps its date through HTML', () => {
    make(doc(para('R squared is a share.'), { type: 'quoteBlock', attrs: { clarify: 'blk1', clarifyLearnedAt: '2026-11-05T10:00:00.000Z' }, content: [{ type: 'quoteText', content: [{ type: 'text', text: 'All models' }] }] }));
    editor.view.dispatch(clarifyRange(editor.state.tr, 2, 11)!);
    const id = collectClarify(editor.state.doc)[0].clarifyId;
    learnedClarify(editor.view, id);
    expect(collectClarify(editor.state.doc)).toEqual([]);
    expect(collectLearned(editor.state.doc)).toHaveLength(1);
    const html = editor.getHTML();
    expect(html).not.toMatch(/data-clarify=/);
    expect(html).toContain('data-clarify-learned');
    expect(html).not.toContain('data-flag-clarify="blk1"');
    expect(html).toContain('data-flag-clarify-kept="blk1"');
    let quote = -1;
    editor.state.doc.descendants((n, pos) => { if (quote < 0 && n.type.name === 'quoteBlock') quote = pos; });
    expect(blockFlag(editor.state, quote, 'clarify')).toBeNull();
    make(doc(para('x')));
    editor.commands.setContent(html);
    expect(collectLearned(editor.state.doc)).toHaveLength(1);
    let kept: Record<string, unknown> = {};
    editor.state.doc.descendants((n) => { if (n.type.name === 'quoteBlock') kept = n.attrs; });
    expect(kept).toMatchObject({ clarify: 'blk1', clarifyLearnedAt: '2026-11-05T10:00:00.000Z' });
  });
});
