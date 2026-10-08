// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { TimelineExtensions } from './Timeline';
import { CycleExtensions } from './Cycle';
import { NoteBlockSelect, NOTE_BLOCK_NODES, deleteBlock } from './blockDesigns';
import { NoteBlockPicks, BLOCK_PART_NODES, deletePicked, partAt, pickedText, picksOf, togglePick, clearPicks } from './blockPicks';

vi.mock('@/components/ConfirmDialog/dialogs', () => ({ alertDialog: vi.fn(async () => {}) }));

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

const TIMELINE = '<div data-type="timeline">'
  + ['1914', '1939', '1969'].map((y) => `<div data-type="timeline-item"><div data-timeline-when>${y}</div><p>Event ${y}</p></div>`).join('')
  + '</div>';
const CYCLE = '<div data-type="cycle"><div data-cycle-name>Loop</div>'
  + ['A', 'B', 'C'].map((l) => `<div data-type="cycle-stage"><div data-cycle-label>${l}</div><div data-cycle-text></div></div>`).join('')
  + '</div>';

function make(block: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, ...TimelineExtensions, ...CycleExtensions, NoteBlockSelect, NoteBlockPicks],
    content: `<p>before</p>${block}<p>after</p>`,
  });
}
function parts(type: string) {
  const out: number[] = [];
  editor.state.doc.descendants((n, p) => { if (n.type.name === type) out.push(p); });
  return out;
}
const pick = (pos: number) => togglePick(editor.view, partAt(editor.state.doc, pos + 2)!);
const blocks = () => { const out: string[] = []; editor.state.doc.forEach((s) => s.forEach((b) => out.push(b.type.name))); return out; };

describe('picking parts of a note block', () => {
  it('every note block names its part type, except the chart (one atom, no parts)', () => {
    const missing = [...NOTE_BLOCK_NODES].filter((b) => b !== 'chart' && !BLOCK_PART_NODES[b]);
    expect(missing).toEqual([]);
  });

  it('every block with parts names a part type the schema knows', () => {
    make(TIMELINE);
    for (const [, part] of Object.entries(BLOCK_PART_NODES).filter(([b]) => editor.schema.nodes[b])) {
      expect(editor.schema.nodes[part]).toBeDefined();
    }
  });

  it('Ctrl+click toggles parts; Delete removes the picked ones; Ctrl+Z brings them back', () => {
    make(TIMELINE);
    const [a, , c] = parts('timelineItem');
    pick(a); pick(c);
    expect(picksOf(editor.state).parts).toHaveLength(2);
    expect(pickedText(editor.state)).toContain('1914');
    expect(pickedText(editor.state)).toContain('1969');
    expect(deletePicked(editor.view)).toBe(true);
    expect(parts('timelineItem')).toHaveLength(1);
    expect(editor.state.doc.textContent).toContain('1939');
    expect(picksOf(editor.state).parts).toHaveLength(0);
    editor.commands.undo();
    expect(parts('timelineItem')).toHaveLength(3);
  });

  it('picking a part again un-picks it, and Esc clears the picks', () => {
    make(TIMELINE);
    const [a, b] = parts('timelineItem');
    pick(a); pick(b); pick(a);
    expect(picksOf(editor.state).parts).toEqual([b]);
    expect(clearPicks(editor.view)).toBe(true);
    expect(picksOf(editor.state).parts).toEqual([]);
  });

  it('any edit to the document clears the picks', () => {
    make(TIMELINE);
    pick(parts('timelineItem')[0]);
    editor.commands.insertContentAt(1, 'x');
    expect(picksOf(editor.state).parts).toEqual([]);
  });

  it('a cycle keeps at least two stages: deleting down to one is refused', () => {
    make(CYCLE);
    const [a, b] = parts('cycleStage');
    pick(a); pick(b);
    expect(deletePicked(editor.view)).toBe(false);
    expect(parts('cycleStage')).toHaveLength(3);
  });

  it('picking every part deletes the whole block', () => {
    make(CYCLE);
    for (const p of parts('cycleStage')) pick(p);
    expect(deletePicked(editor.view)).toBe(true);
    expect(blocks()).toEqual(['paragraph', 'paragraph']);
  });
});

describe('deleting a whole block', () => {
  it('deleteBlock removes the block (the pill and right-click Delete)', () => {
    make(TIMELINE);
    let pos = -1;
    editor.state.doc.descendants((n, p) => { if (n.type.name === 'timeline') pos = p; });
    deleteBlock(editor.view, pos);
    expect(blocks()).toEqual(['paragraph', 'paragraph']);
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
  });
});
