// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { CycleExtensions, addStage, reverseCycle, ringPlacement, setCycleSettings, setStageAttrs } from './Cycle';
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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...CycleExtensions],
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
function press(key: string, shiftKey = false) {
  const view = editor.view;
  return view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))) ?? false;
}

// "Name: Label (text) arrow / …" for the cycle, "type:text" for anything else.
function outline(): string[] {
  const ARROW: Record<string, string> = { forward: '→', back: '←', both: '↔' };
  const out: string[] = [];
  editor.state.doc.forEach((section) => section.forEach((b) => {
    if (b.type.name !== 'cycle') { out.push(`${b.type.name}:${b.textContent}`); return; }
    const stages: string[] = [];
    b.forEach((s, _o, i) => {
      if (i === 0) return;
      const text = s.child(1).textContent;
      stages.push(`${s.child(0).textContent}${text ? ` (${text})` : ''} ${ARROW[s.attrs.arrow]}${s.attrs.arrowLabel ? s.attrs.arrowLabel : ''}`);
    });
    out.push(`cycle(${b.attrs.variant}) ${b.child(0).textContent}: ${stages.join(' / ')}`);
  }));
  return out;
}
const part = () => editor.state.selection.$from.parent.type.name;
const cyclePos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'cycle') p = pos; }); return p; };
const stagePositions = () => {
  const out: number[] = [];
  editor.state.doc.descendants((n, pos) => { if (n.type.name === 'cycleStage') out.push(pos); });
  return out;
};

describe('cycle block', () => {
  it('`\\cycle` inserts three stages; Enter goes name → stage → its note → a new stage', () => {
    make();
    type('\\cycle ');
    expect(part()).toBe('cycleName');
    type('Water cycle');
    press('Enter');
    expect(part()).toBe('cycleLabel');
    type('Ocean');
    press('Enter');
    expect(part()).toBe('cycleText');
    type('water warms');
    press('Enter');                       // on into the empty second stage, not a new one
    expect(part()).toBe('cycleLabel');
    type('Clouds');
    press('Tab');
    type('Rain');
    press('Enter');
    press('Enter');                       // past Rain's empty note: a fourth stage
    type('Rivers');
    expect(outline()).toEqual(['cycle(ring) Water cycle: Ocean (water warms) → / Clouds → / Rain → / Rivers →']);
  });

  it('Enter in an empty stage leaves the cycle, removing it while more than two would remain', () => {
    make();
    type('\\cycle A');
    press('Tab');
    type('B');
    press('Tab');                          // the third, empty stage
    press('Enter');
    expect(part()).toBe('paragraph');
    // The empty second stage went (three would have left two); the third, still empty, stays.
    expect(outline()).toEqual(['cycle(ring) A: B → /  →', 'paragraph:']);
  });

  it('never fewer than two stages: Backspace in an empty stage of two only steps back', () => {
    make();
    type('\\cycle ');
    press('Enter');
    type('One');
    press('Tab');
    press('Tab');                          // third stage
    press('Backspace');                    // removes it (three → two)
    expect(stagePositions()).toHaveLength(2);
    press('Tab');                          // second (empty) stage
    press('Backspace');
    expect(stagePositions()).toHaveLength(2);
  });

  it('arrows: per-arrow direction and name; reverse turns every one round', () => {
    make();
    type('\\cycle Loop');
    press('Enter');
    type('A');
    press('Tab');
    type('B');
    const [a, b] = stagePositions();
    setStageAttrs(editor.view, a, { arrowLabel: 'grows' });
    setStageAttrs(editor.view, b, { arrow: 'both' });
    reverseCycle(editor.view, cyclePos());
    expect(outline()[0]).toBe('cycle(ring) Loop: A ←grows / B ↔ /  ←');
  });

  it('designs, numbering, colours and icons round-trip through JSON and HTML', () => {
    make();
    type('\\cycle Loop');
    press('Enter');
    type('A');
    setCycleSettings(editor.view, cyclePos(), { variant: 'steps', numbered: true, colours: 'spectrum', iconShape: 'rounded', iconSize: 'l' });
    setStageAttrs(editor.view, stagePositions()[0], { icon: '💧' });
    addStage(editor.view, cyclePos());
    type('Z');
    const json = editor.getJSON();
    const html = editor.getHTML();
    for (const content of [json, html]) {
      editor.commands.setContent(content);
      let attrs: Record<string, unknown> = {};
      editor.state.doc.descendants((n) => { if (n.type.name === 'cycle') attrs = n.attrs; });
      expect(attrs).toMatchObject({ variant: 'steps', numbered: true, colours: 'spectrum', iconShape: 'rounded', iconSize: 'l' });
      expect(stagePositions()).toHaveLength(4);
      expect(editor.state.doc.nodeAt(stagePositions()[0])!.attrs.icon).toBe('💧');
    }
  });

  it('draws an arrow after every stage (the last one returns), icon slots, and the ring places stages round a circle', () => {
    make();
    type('\\cycle ');
    const dom = editor.view.dom;
    expect(dom.querySelectorAll('[data-cycle-arrow]')).toHaveLength(3);
    expect(dom.querySelectorAll('[data-cycle-icon]')).toHaveLength(3);
    expect(ringPlacement(0, 4)).toEqual({ x: 50, y: 12 });
    expect(ringPlacement(1, 4)).toEqual({ x: 88, y: 50 });
    setCycleSettings(editor.view, cyclePos(), { variant: 'flow' });
    expect([...dom.querySelectorAll('[data-cycle-line-arrow]')].map((a) => a.getAttribute('data-cycle-line-arrow'))).toEqual(['next', 'next', 'return']);
  });

  it('copies as plain text with its arrows', () => {
    make();
    type('\\cycle Water');
    press('Enter');
    type('Ocean');
    press('Tab');
    type('Clouds');
    setStageAttrs(editor.view, stagePositions()[0], { arrowLabel: 'Evaporation' });
    const text = noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size));
    expect(text).toBe('Water\n- Ocean\n  → Evaporation\n- Clouds\n  →\n- \n  → (back to Ocean)');
  });
});
