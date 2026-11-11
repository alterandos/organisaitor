// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from '@/components/NoteEditor/extensions/Section';
import { QuoteExtensions } from '@/components/NoteEditor/extensions/Quote';
import { GlossaryCardExtensions } from '@/components/NoteEditor/extensions/GlossaryCard';
import { NoteObjectTrigger, objectTriggerStorage } from '@/components/NoteEditor/objects/NoteObjectTrigger';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import type { NoteId } from '@/types';

vi.mock('@/components/Toast/showToast', () => ({ showToast: () => {} }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const wait = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const { sendQuoteBlock, quotesList, keepQuote, isKeptFromBlock } = await import('./keptQuotes');
const { glossaryListRows } = await import('./glossaryLists');
const { glossaryEntries } = await import('./glossary');

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useListStore.setState(useListStore.getInitialState(), true);
});
afterEach(() => editor?.destroy());

const QUOTE = '<div data-type="quote"><div data-qb-text>Less is more.</div><div data-qb-field="who">Mies van der Rohe</div><div data-qb-field="when">1947</div></div>';
async function make(noteId: string, content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...QuoteExtensions, ...GlossaryCardExtensions],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId, collectionId: null, now: new Date() });
  await wait();
}
const quotePos = () => { let pos = -1; editor.state.doc.descendants((n, p) => { if (n.type.name === 'quoteBlock') pos = p; }); return pos; };
const entry = (id: string) => useNoteStore.getState().structuredTagEntries[id as never];

describe('a quote block sent to Quotes (2026-11-11: it stays a block)', () => {
  it('keeps a quote record of its words and attribution in the Quotes list, the block staying as it is', async () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Speeches' }) as NoteId;
    await make(noteId, QUOTE);
    expect(sendQuoteBlock(editor.view, quotePos(), noteId)).toBe(true);
    const keptId = editor.state.doc.nodeAt(quotePos())!.attrs.keptId as string;
    expect(keptId).toBeTruthy();
    expect(entry(keptId)).toMatchObject({ typeKey: 'quote', noteId, fields: { text: 'Less is more.', who: 'Mies van der Rohe', when: '1947' } });
    expect(glossaryListRows(quotesList()!.id).map((r) => r.entry.id)).toEqual([keptId]);
    let cards = 0;
    editor.state.doc.descendants((n) => { if (n.type.name === 'glossaryCard') cards++; });
    expect(cards).toBe(0);
    // Its note holds the block, so the record is shown read-only elsewhere (GlossaryRecordModal).
    expect(isKeptFromBlock(keptId)).toBe(false);
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [noteId]: { ...s.notes[noteId], content: JSON.stringify(editor.getJSON()) } } }));
    expect(isKeptFromBlock(keptId)).toBe(true);
    expect(isKeptFromBlock(keepQuote({ text: 'Copied.' }, { toast: false })!)).toBe(false);
    // Sent again, it isn't kept twice.
    sendQuoteBlock(editor.view, quotePos(), noteId);
    expect(Object.values(useNoteStore.getState().structuredTagEntries)).toHaveLength(2);
  });

  it('the record follows the block as it is edited, its headline too', async () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Speeches' }) as NoteId;
    await make(noteId, QUOTE);
    sendQuoteBlock(editor.view, quotePos(), noteId);
    const keptId = editor.state.doc.nodeAt(quotePos())!.attrs.keptId as string;
    const textPos = quotePos() + 1;
    act(() => { editor.view.dispatch(editor.state.tr.insertText('Much ', textPos + 1)); });
    await wait(600);
    expect(entry(keptId).fields).toMatchObject({ text: 'Much Less is more.', who: 'Mies van der Rohe' });
    expect(entry(keptId).term).toContain('Much Less');
  });

  it('a quote card from before becomes a kept quote block when its note opens', async () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Speeches' }) as NoteId;
    const id = keepQuote({ text: 'Stay hungry.', who: 'Steve Jobs', noteId }, { toast: false })!;
    await make(noteId, `<div data-type="glossary-card" data-entry-id="${id}"></div>`);
    await wait();
    const node = editor.state.doc.nodeAt(quotePos());
    expect(node?.attrs.keptId).toBe(id);
    expect(node?.textContent).toContain('Stay hungry.');
  });

  it('quotes are kept out of the Glossary', () => {
    keepQuote({ text: 'Stay hungry.', who: 'Steve Jobs' }, { toast: false });
    expect(glossaryEntries().some((e) => e.typeKey === 'quote')).toBe(false);
  });
});
