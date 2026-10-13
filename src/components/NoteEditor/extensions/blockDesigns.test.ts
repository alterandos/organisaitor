// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { TimelineExtensions } from './Timeline';
import { QuoteExtensions } from './Quote';
import { CycleExtensions, canDeleteStage, deleteStage, ringArcEnds } from './Cycle';
import { NoteBlockSelect, NOTE_BLOCK_NODES, applyFrameAttrs, blockAround, frameButtons, frameMenuItem, frameOverflow, setBlockFrame } from './blockDesigns';
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

describe('frames fit around what a block draws', () => {
  const rect = (left: number, top: number, right: number, bottom: number) => new DOMRect(left, top, right - left, bottom - top);

  it('measures the furthest any part reaches past the box', () => {
    const box = rect(0, 0, 100, 100);
    expect(frameOverflow(box, [rect(10, 10, 90, 90)])).toBe(0);
    expect(frameOverflow(box, [rect(-14.2, 40, 20, 60), rect(80, 95, 120, 103)])).toBe(20);
    expect(frameOverflow(box, [rect(-50, -50, -50, -50)])).toBe(0);   // an empty box doesn't count
  });

  it('a bigger block (a cycle) keeps its Outline; only card blocks go without', () => {
    make(BLOCKS.cycle);
    let pos = -1;
    editor.state.doc.descendants((n, p) => { if (pos < 0 && n.type.name === 'cycle') pos = p; });
    const frames = frameButtons(editor.view, () => pos + 1, editor.state.doc.nodeAt(pos)!.attrs);
    expect([...frames.querySelectorAll('[data-block-frame]')].map((b) => b.getAttribute('data-block-frame'))).toEqual(['outlined', 'shaded', 'options']);
  });

  it('an outlined ring whose side cards hang outside it gets a wider frame', () => {
    vi.useFakeTimers();
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.matches('[data-type="cycle"]')) return rect(0, 0, 100, 100);
      if (this.matches('[data-type="cycle-stage"]')) return rect(-18, 40, 10, 60);
      return rect(10, 10, 20, 20);
    };
    try {
      make(BLOCKS.cycle.replace('data-type="cycle"', 'data-type="cycle" data-variant="ring" data-outlined="true"'));
      vi.advanceTimersByTime(50);
      const ring = editor.view.dom.querySelector<HTMLElement>('[data-type="cycle"]')!;
      expect(ring.style.getPropertyValue('--frame-overflow')).toBe('18px');
    } finally {
      Element.prototype.getBoundingClientRect = original;
      vi.useRealTimers();
    }
  });
});

describe('frame colours, shapes and lines', () => {
  const quotePos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'quoteBlock') p = pos; }); return p; };
  const quote = () => editor.state.doc.nodeAt(quotePos())!;

  it('choosing an outline option turns the outline on; a shade colour turns the shade on', () => {
    make(BLOCKS.quote);
    setBlockFrame(editor.view, quotePos(), { outlineColor: 'teal' });
    expect(quote().attrs).toMatchObject({ outlined: true, outlineColor: 'teal', shaded: false });
    setBlockFrame(editor.view, quotePos(), { shadeColor: '#336699' });
    expect(quote().attrs).toMatchObject({ shaded: true, shadeColor: '#336699' });
    setBlockFrame(editor.view, quotePos(), { frameShape: 'pill', outlineStyle: 'dashed', outlineWidth: 'thick' });
    const dom = editor.view.dom.querySelector<HTMLElement>('[data-type="quote"]')!;
    expect(dom.getAttribute('data-frame-shape')).toBe('pill');
    expect(dom.getAttribute('data-outline-style')).toBe('dashed');
    expect(dom.getAttribute('data-outline-width')).toBe('thick');
    expect(dom.style.getPropertyValue('--frame-outline')).toBe('var(--color-swatch-teal)');
    expect(dom.style.getPropertyValue('--frame-shade')).toBe('#336699');
  });

  it('round-trips through HTML, and a colour that is not a swatch or #rrggbb is dropped', () => {
    make(BLOCKS.quote.replace('data-type="quote"', 'data-type="quote" data-outlined="true" data-outline-color="red" data-frame-shape="rounded" data-shade-color="red;background:url(x)"'));
    expect(quote().attrs).toMatchObject({ outlined: true, outlineColor: 'red', frameShape: 'rounded', shadeColor: null });
    const html = editor.getHTML();
    editor.commands.setContent(html);
    expect(quote().attrs).toMatchObject({ outlineColor: 'red', frameShape: 'rounded' });
  });

  it('a node view gets the same frame attributes (applyFrameAttrs), and loses them when cleared', () => {
    const el = document.createElement('div');
    applyFrameAttrs(el, { outlined: true, outlineColor: 'blue', frameShape: 'circle', outlineStyle: 'solid', outlineWidth: 'thin' });
    expect(el.getAttribute('data-outlined')).toBe('true');
    expect(el.getAttribute('data-frame-shape')).toBe('circle');
    expect(el.style.getPropertyValue('--frame-outline')).toBe('var(--color-swatch-blue)');
    applyFrameAttrs(el, { outlined: false, outlineColor: null, frameShape: 'square' });
    expect(el.hasAttribute('data-outlined')).toBe(false);
    expect(el.hasAttribute('data-frame-shape')).toBe(false);
    expect(el.style.getPropertyValue('--frame-outline')).toBe('');
  });

  it('the right-click Frame menu offers a circle only for a block about as tall as it is wide', () => {
    make(BLOCKS.quote);
    const original = Element.prototype.getBoundingClientRect;
    const shapes = () => {
      const menu = frameMenuItem(editor.view, quotePos(), quote().attrs);
      const shape = menu.submenu![1].find((i) => i.id === 'frame-shape')!;
      return shape.submenu![0].map((i) => i.id);
    };
    try {
      Element.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 400, 120);
      expect(shapes()).not.toContain('frame-shape-circle');
      Element.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 300, 290);
      expect(shapes()).toContain('frame-shape-circle');
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });
});
