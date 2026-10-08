// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { TimelineExtensions } from './Timeline';
import { QuoteExtensions } from './Quote';
import { CycleExtensions, canDeleteStage, deleteStage, ringArcEnds } from './Cycle';
import { NoteBlockSelect, NOTE_BLOCK_NODES, blockAround } from './blockDesigns';
import { noteClipboardText } from '../noteClipboardText';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

const BLOCKS = {
  timeline: '<div data-type="timeline"><div data-type="timeline-item"><div data-timeline-when>1914</div><p>War</p></div></div>',
  quote:    '<div data-type="quote"><div data-qb-text>Words</div><div data-qb-field="who">Ada</div></div>',
  cycle:    '<div data-type="cycle"><div data-cycle-name>Loop</div><div data-type="cycle-stage"><div data-cycle-label>A</div><div data-cycle-text></div></div><div data-type="cycle-stage"><div data-cycle-label>B</div><div data-cycle-text></div></div><div data-type="cycle-stage"><div data-cycle-label>C</div><div data-cycle-text></div></div></div>',
};

function make(block: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, ...TimelineExtensions, ...QuoteExtensions, ...CycleExtensions, NoteBlockSelect],
    content: `<p>before</p>${block}<p>after</p>`,
  });
}
const pressEscape = () => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
const blocks = () => { const out: string[] = []; editor.state.doc.forEach((s) => s.forEach((b) => out.push(b.type.name))); return out; };

describe('selecting a whole note block', () => {
  it.each(Object.entries(BLOCKS))('%s: Esc inside it selects the whole block; Delete then removes it', (_name, html) => {
    make(html);
    editor.commands.setTextSelection(10 + 3);    // somewhere inside the block's text
    expect(blockAround(editor.state)).not.toBeNull();
    expect(pressEscape()).toBe(true);
    const sel = editor.state.selection;
    expect(sel).toBeInstanceOf(NodeSelection);
    expect(NOTE_BLOCK_NODES.has((sel as NodeSelection).node.type.name)).toBe(true);
    // A second Esc isn't the block's: it goes on to whatever is around the editor.
    expect(pressEscape()).toBeFalsy();
    // The plain-text copy of the selection is the whole block.
    expect(noteClipboardText(sel.content()).length).toBeGreaterThan(0);
    editor.commands.deleteSelection();
    expect(blocks()).toEqual(['paragraph', 'paragraph']);
  });

  it('Esc outside any block does nothing', () => {
    make(BLOCKS.quote);
    editor.commands.setTextSelection(3);
    expect(pressEscape()).toBeFalsy();
  });
});

describe('cycle stages', () => {
  it('a stage can be deleted down to two, never below', () => {
    make(BLOCKS.cycle);
    const stages = () => { const out: number[] = []; editor.state.doc.descendants((n, p) => { if (n.type.name === 'cycleStage') out.push(p); }); return out; };
    expect(editor.view.dom.querySelectorAll('[data-cycle-delete]')).toHaveLength(3);
    expect(deleteStage(editor.view, stages()[1])).toBe(true);
    expect(stages()).toHaveLength(2);
    expect(editor.view.dom.querySelectorAll('[data-cycle-delete]')).toHaveLength(0);
    expect(canDeleteStage(editor.state, stages()[0])).toBe(false);
    expect(deleteStage(editor.view, stages()[0])).toBe(false);
    expect(stages()).toHaveLength(2);
  });

  it('ring arcs end at the cards’ edges: smaller cards, longer arcs', () => {
    // Stage 1 of 4 sits at the right (0°), where the circle runs downwards, so its card's height
    // decides where the arc leaves it; stage 2 is at the bottom (90°), where its width decides.
    const [tallFrom, wideTo] = ringArcEnds(1, 4, { hw: 14, hh: 12 }, { hw: 16, hh: 9 });
    const [shortFrom, narrowTo] = ringArcEnds(1, 4, { hw: 14, hh: 5 }, { hw: 9, hh: 9 });
    expect(shortFrom).toBeLessThan(tallFrom);
    expect(narrowTo).toBeGreaterThan(wideTo);
    // Both ends are between the two cards' centres.
    expect(shortFrom).toBeGreaterThan(0);
    expect(narrowTo).toBeLessThan(90);
  });
});
