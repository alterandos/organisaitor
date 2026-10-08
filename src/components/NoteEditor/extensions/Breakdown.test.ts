// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { BreakdownExtensions, deletePart, hubPlacement, setBreakdownSettings } from './Breakdown';
import { TimelineExtensions } from './Timeline';
import { QuoteExtensions } from './Quote';
import { CycleExtensions } from './Cycle';
import { HierarchyExtensions } from './Hierarchy';
import { PyramidExtensions } from './Pyramid';
import { NOTE_BLOCK_NODES, toggleBlockFrame } from './blockDesigns';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content = '<p></p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger,
      ...BreakdownExtensions, ...TimelineExtensions, ...QuoteExtensions, ...CycleExtensions, ...HierarchyExtensions, ...PyramidExtensions],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId: 'n', collectionId: null, now: new Date() });
  editor.commands.focus('end');
}
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const press = (key: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
const breakdownPos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'breakdown') p = pos; }); return p; };
const parts = () => { const out: number[] = []; editor.state.doc.descendants((n, p) => { if (n.type.name === 'breakdownPart') out.push(p); }); return out; };
const summary = () => {
  const b = editor.state.doc.nodeAt(breakdownPos())!;
  const ps: string[] = [];
  b.forEach((c, _o, i) => { if (i > 0) ps.push(c.textContent); });
  return `${b.child(0).textContent}: ${ps.join(' | ')}`;
};

describe('breakdown block', () => {
  it('`\\breakdown` (or `\\pillars`) inserts a whole and three parts; Enter walks through them', () => {
    make();
    type('\\pillars ');
    expect(editor.state.selection.$from.parent.type.name).toBe('breakdownWhole');
    type('Democracy');
    press('Enter');
    type('Free press');
    press('Enter');
    type('Holds power to account');
    press('Enter');                        // on into the waiting second part
    type('Informed citizens');
    press('Enter');
    press('Enter');                        // its note is empty: on to the third
    type('Rule of law');
    expect(summary()).toBe('Democracy: Free pressHolds power to account | Informed citizens | Rule of law');
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size)))
      .toBe('Democracy, made up of:\n- Free press — Holds power to account\n- Informed citizens\n- Rule of law');
  });

  it('parts can be deleted down to two, never below; the hub draws a spoke per part', () => {
    make();
    type('\\breakdown Whole');
    const dom = editor.view.dom;
    expect(dom.querySelectorAll('[data-bd-spokes] line')).toHaveLength(3);
    expect(dom.querySelectorAll('[data-bd-delete]')).toHaveLength(3);
    expect(deletePart(editor.view, parts()[2])).toBe(true);
    expect(deletePart(editor.view, parts()[1])).toBe(false);
    expect(parts()).toHaveLength(2);
    expect(dom.querySelectorAll('[data-bd-delete]')).toHaveLength(0);
    expect(hubPlacement(0, 4)).toEqual({ x: 50, y: 13 });
  });

  it('designs and colours round-trip through JSON and HTML', () => {
    make();
    type('\\breakdown Whole');
    setBreakdownSettings(editor.view, breakdownPos(), { variant: 'tree', colours: 'spectrum' });
    for (const content of [editor.getJSON(), editor.getHTML()]) {
      editor.commands.setContent(content);
      expect(editor.state.doc.nodeAt(breakdownPos())!.attrs).toMatchObject({ variant: 'tree', colours: 'spectrum' });
    }
  });
});

describe('block frames (Outline, Shade) on every note block', () => {
  const blocks: Record<string, string> = {
    timeline: '\\timeline ',
    quoteBlock: '\\quote ',
    cycle: '\\cycle ',
    breakdown: '\\breakdown ',
    hierarchy: '\\hierarchy ',
    pyramid: '\\pyramid ',
  };
  it.each(Object.entries(blocks))('%s can be outlined and shaded, and keeps it', (name, keyword) => {
    make();
    type(keyword);
    let pos = -1;
    editor.state.doc.descendants((n, p) => { if (n.type.name === name) pos = p; });
    expect(NOTE_BLOCK_NODES.has(name)).toBe(true);
    toggleBlockFrame(editor.view, pos, 'outlined');
    toggleBlockFrame(editor.view, pos, 'shaded');
    expect(editor.getHTML()).toContain('data-outlined="true"');
    expect(editor.getHTML()).toContain('data-shaded="true"');
    expect(editor.view.dom.querySelector('[data-block-frame="outlined"]')?.getAttribute('aria-pressed')).toBe('true');
    editor.commands.setContent(editor.getHTML());
    editor.state.doc.descendants((n, p) => { if (n.type.name === name) pos = p; });
    expect(editor.state.doc.nodeAt(pos)!.attrs).toMatchObject({ outlined: true, shaded: true });
    toggleBlockFrame(editor.view, pos, 'shaded');
    expect(editor.state.doc.nodeAt(pos)!.attrs.shaded).toBe(false);
  });
});
