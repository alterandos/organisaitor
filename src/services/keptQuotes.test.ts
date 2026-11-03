// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from '@/components/NoteEditor/extensions/Section';
import { QuoteBlock, QuoteText, QuoteFieldNode } from '@/components/NoteEditor/extensions/Quote';
import { GlossaryCardExtensions } from '@/components/NoteEditor/extensions/GlossaryCard';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import type { NoteId } from '@/types';

vi.mock('@/components/Toast/showToast', () => ({ showToast: () => {} }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const { quoteBlockToRecord, quotesList } = await import('./keptQuotes');
const { glossaryListRows } = await import('./glossaryLists');

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

describe('a quote block kept in Quotes (2026-11-03)', () => {
  it('becomes a card of a Quote record holding its words and shown fields, kept in the Quotes list', async () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Speeches' }) as NoteId;
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, QuoteBlock, QuoteText, QuoteFieldNode, ...GlossaryCardExtensions],
      content: '<div data-type="quote"><div data-qb-text>Less is more.</div><div data-qb-field="who">Mies van der Rohe</div><div data-qb-field="when">1947</div></div>',
    });
    let pos = -1;
    editor.state.doc.descendants((n, p) => { if (n.type.name === 'quoteBlock') pos = p; });
    expect(pos).toBeGreaterThanOrEqual(0);
    expect(quoteBlockToRecord(editor.view, pos, noteId)).toBe(true);
    await flush();
    const cards: string[] = [];
    editor.state.doc.descendants((n) => { if (n.type.name === 'glossaryCard') cards.push(n.attrs.entryId); });
    let quotes = 0;
    editor.state.doc.descendants((n) => { if (n.type.name === 'quoteBlock') quotes++; });
    expect(quotes).toBe(0);
    expect(cards).toHaveLength(1);
    const raw = useNoteStore.getState().structuredTagEntries[cards[0] as never];
    expect(raw).toMatchObject({ typeKey: 'quote', noteId, fields: { text: 'Less is more.', who: 'Mies van der Rohe', when: '1947' } });
    expect(glossaryListRows(quotesList()!.id).map((r) => r.entry.id)).toEqual([cards[0]]);
    await act(async () => { editor.destroy(); });
  });
});
