// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { TimelineExtensions } from './Timeline';
import { GlossaryCardExtensions } from './GlossaryCard';
import { BlockImportance, blockImportance, cycleBlockImportance, levelLabel, selectedBlock, setBlockImportance } from './BlockImportance';
import { marginItems } from './MarginColumn';
import { useNoteStore } from '@/store/noteStore';
import { glossaryEntries } from '@/services/glossary';
import { defineInItsNote } from '@/test/glossaryFixtures';
import type { NoteId } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
let noteId: NoteId;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  noteId = useNoteStore.getState().addNote({ title: 'Biology' }) as NoteId;
});
// A card draws itself with React a moment later; let it before the next step or teardown.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
afterEach(async () => { await settle(); editor?.destroy(); await settle(); });

const TIMELINE = '<div data-type="timeline"><div data-type="timeline-item"><div data-timeline-when>1914</div><p>War</p></div></div>';
function make(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, ...TimelineExtensions, ...GlossaryCardExtensions, BlockImportance],
    content,
  });
}
const posOf = (name: string) => { let p = -1; editor.state.doc.descendants((n, at) => { if (p < 0 && n.type.name === name) p = at; }); return p; };

describe('important blocks', () => {
  it('a block takes a level, shown on it and in the margin column; Ctrl+1 on it selected steps through the levels and off', () => {
    make(`<p>before</p>${TIMELINE}`);
    const pos = posOf('timeline');
    setBlockImportance(editor.view, pos, 1);
    expect(blockImportance(editor.state, pos)).toBe(1);
    expect(editor.view.dom.querySelector('[data-type="timeline"]')!.getAttribute('data-importance')).toBe('1');
    expect(marginItems(editor.state).filter((m) => m.key.startsWith('important-block'))).toHaveLength(1);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
    expect(selectedBlock(editor.state)).toBe(pos);
    cycleBlockImportance(editor.view, pos);
    cycleBlockImportance(editor.view, pos);
    expect(blockImportance(editor.state, pos)).toBe(3);
    cycleBlockImportance(editor.view, pos);
    expect(blockImportance(editor.state, pos)).toBe(0);
    expect(marginItems(editor.state).filter((m) => m.key.startsWith('important-block'))).toHaveLength(0);
  });

  it('round-trips through HTML', () => {
    make(TIMELINE.replace('data-type="timeline"', 'data-type="timeline" data-importance="3"'));
    expect(blockImportance(editor.state, posOf('timeline'))).toBe(3);
    expect(editor.getHTML()).toContain('data-importance="3"');
  });

  it('a Glossary card’s importance is its record’s: "Key concept", listed so in the Glossary', () => {
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'concept', tagId: 'concept', term: 'Osmosis', fields: { summary: 'Water moving' }, noteId, collectionId: null });
    defineInItsNote(id);
    make(`<div data-type="glossary-card" data-entry-id="${id}"></div>`);
    const pos = posOf('glossaryCard');
    setBlockImportance(editor.view, pos, 1);
    expect(useNoteStore.getState().structuredTagEntries[id as never].fields.importance).toBe(1);
    expect(blockImportance(editor.state, pos)).toBe(1);
    expect(levelLabel(editor.state, pos, 1)).toBe('Key concept');
    expect(glossaryEntries().find((e) => e.id === id)?.importance).toBe(1);
    expect(editor.state.doc.nodeAt(pos)!.attrs.importance).toBeUndefined();   // nothing kept on the card itself
    setBlockImportance(editor.view, pos, 0);
    expect(useNoteStore.getState().structuredTagEntries[id as never].fields.importance).toBeUndefined();
  });
});
