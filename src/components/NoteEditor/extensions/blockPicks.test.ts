// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { TimelineExtensions } from './Timeline';
import { CycleExtensions } from './Cycle';
import { NoteBlockDelete, NoteBlockSelect, NOTE_BLOCK_NODES, deleteBlock, isEmptyBlock } from './blockDesigns';
import { useDialogStore } from '@/store/dialogStore';
import { NoteBlockPicks, BLOCK_PART_NODES, deletePicked, partAt, pickedText, picksOf, togglePick, clearPicks } from './blockPicks';

vi.mock('@/components/ConfirmDialog/dialogs', async (orig) => ({ ...(await orig<typeof import('@/components/ConfirmDialog/dialogs')>()), alertDialog: vi.fn(async () => {}) }));

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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, ...TimelineExtensions, ...CycleExtensions, NoteBlockSelect, NoteBlockDelete, NoteBlockPicks],
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
  it('every note block names its part type, except the ones with no parts (chart, maths, Glossary card, diagram, convert: one atom; code: one text)', () => {
    const NO_PARTS = new Set(['chart', 'codeBlock', 'mathBlock', 'glossaryCard', 'diagram', 'convertBlock']);
    const missing = [...NOTE_BLOCK_NODES].filter((b) => !NO_PARTS.has(b) && !BLOCK_PART_NODES[b]);
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
  const posOf = (name: string) => { let pos = -1; editor.state.doc.descendants((n, p) => { if (n.type.name === name) pos = p; }); return pos; };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  afterEach(() => useDialogStore.setState({ queue: [] }));

  it('a block with something in it asks first (the pill, right-click Delete, Alt+Delete); cancel keeps it', async () => {
    make(TIMELINE);
    void deleteBlock(editor.view, posOf('timeline'));
    await flush();
    const asked = useDialogStore.getState().queue[0];
    expect(asked.title).toBe('Delete this block?');
    asked.resolve('cancel');
    await flush();
    expect(blocks()).toEqual(['paragraph', 'timeline', 'paragraph']);
    useDialogStore.setState({ queue: [] });
    void deleteBlock(editor.view, posOf('timeline'));
    await flush();
    useDialogStore.getState().queue[0].resolve('confirm');
    await flush();
    expect(blocks()).toEqual(['paragraph', 'paragraph']);
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
  });

  it('an empty block goes at once, without asking', async () => {
    make('<div data-type="timeline"><div data-type="timeline-item"><div data-timeline-when></div><p></p></div></div>');
    expect(isEmptyBlock(editor.state.doc.nodeAt(posOf('timeline'))!)).toBe(true);
    await deleteBlock(editor.view, posOf('timeline'));
    expect(useDialogStore.getState().queue).toHaveLength(0);
    expect(blocks()).toEqual(['paragraph', 'paragraph']);
  });

  it('Alt+Delete typed in an input of the block’s own (a card field, maths) deletes the block too', async () => {
    make('<div data-type="timeline"><div data-type="timeline-item"><div data-timeline-when></div><p></p></div></div>');
    const field = document.createElement('div');
    field.contentEditable = 'true';
    editor.view.dom.querySelector('[data-type="timeline"]')!.appendChild(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', altKey: true, bubbles: true, cancelable: true }));
    await flush();
    expect(blocks()).toEqual(['paragraph', 'paragraph']);
  });

  it('Alt+Delete with the cursor inside a block deletes that block', async () => {
    make('<div data-type="timeline"><div data-type="timeline-item"><div data-timeline-when></div><p></p></div></div>');
    editor.commands.setTextSelection(posOf('timeline') + 3);
    const event = new KeyboardEvent('keydown', { key: 'Delete', altKey: true, bubbles: true, cancelable: true });
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, event));
    await flush();
    expect(blocks()).toEqual(['paragraph', 'paragraph']);
  });

  it('Ctrl+Delete is left to delete the next word', async () => {
    make('<div data-type="timeline"><div data-type="timeline-item"><div data-timeline-when></div><p></p></div></div>');
    editor.commands.setTextSelection(posOf('timeline') + 3);
    const event = new KeyboardEvent('keydown', { key: 'Delete', ctrlKey: true, bubbles: true, cancelable: true });
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, event));
    await flush();
    expect(blocks()).toContain('timeline');
  });
});
