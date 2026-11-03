// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { StepsExtensions, STEPS_VARIANTS, addStep, deleteStep, setStepAttrs, setStepsSettings } from './Steps';
import { NOTE_BLOCK_NODES, toggleBlockFrame } from './blockDesigns';
import { BLOCK_DESIGN_LISTS } from './designCycle';
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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...StepsExtensions],
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
const press = (key: string, shiftKey = false) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })));
const stepsPos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'steps') p = pos; }); return p; };
const stepPositions = () => { const out: number[] = []; editor.state.doc.descendants((n, p) => { if (n.type.name === 'stepsStep') out.push(p); }); return out; };
const summary = () => {
  const b = editor.state.doc.nodeAt(stepsPos())!;
  const ss: string[] = [];
  b.forEach((c, _o, i) => { if (i > 0) ss.push(c.textContent); });
  return `${b.child(0).textContent}: ${ss.join(' | ')}`;
};

describe('steps block (2026-11-02)', () => {
  it('`\\steps` puts in a name and three steps; Enter walks through them, a new step when they run out', () => {
    make();
    type('\\steps ');
    expect(editor.state.selection.$from.parent.type.name).toBe('stepsName');
    type('Data preprocessing');
    press('Enter');
    type('Data profiling');
    press('Enter');
    type('What is there');
    press('Enter');                       // on into the waiting second step
    type('Data cleansing');
    press('Enter');
    press('Enter');                       // its note is empty: on to the third
    type('Data reduction');
    press('Enter');
    press('Enter');
    type('Data transformation');          // a fourth, made by Enter
    expect(summary()).toBe('Data preprocessing: Data profilingWhat is there | Data cleansing | Data reduction | Data transformation');
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size)))
      .toBe('Data preprocessing, in 4 steps:\n1. Data profiling — What is there\n2. Data cleansing\n3. Data reduction\n4. Data transformation');
  });

  it('Enter in an empty step leaves the block, taking the step with it', () => {
    make();
    type('\\steps Name');
    press('Enter');
    type('One');
    press('Enter');
    press('Enter');
    type('Two');
    press('Enter');
    press('Enter');                       // into the empty third
    press('Enter');                       // empty: out, and the third goes
    expect(stepPositions()).toHaveLength(2);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('Tab and Shift+Tab move between steps, and up to the name', () => {
    make();
    type('\\steps ');
    press('Tab');
    expect(editor.state.selection.$from.parent.type.name).toBe('stepsLabel');
    press('Tab');
    press('Tab', true);
    press('Tab', true);
    expect(editor.state.selection.$from.parent.type.name).toBe('stepsName');
  });

  it('steps can be added and deleted down to two, never below', () => {
    make();
    type('\\steps Name');
    addStep(editor.view, stepsPos());
    expect(stepPositions()).toHaveLength(4);
    expect(deleteStep(editor.view, stepPositions()[3])).toBe(true);
    expect(deleteStep(editor.view, stepPositions()[2])).toBe(true);
    expect(deleteStep(editor.view, stepPositions()[1])).toBe(false);
    expect(stepPositions()).toHaveLength(2);
  });

  it('every design, the colours, a step icon and frames round-trip through JSON and HTML', () => {
    make();
    type('\\steps Name');
    setStepAttrs(editor.view, stepPositions()[0], { icon: '🧪' });
    toggleBlockFrame(editor.view, stepsPos(), 'outlined');
    for (const variant of STEPS_VARIANTS) {
      setStepsSettings(editor.view, stepsPos(), { variant, colours: 'spectrum' });
      for (const content of [editor.getJSON(), editor.getHTML()]) {
        editor.commands.setContent(content);
        expect(editor.state.doc.nodeAt(stepsPos())!.attrs).toMatchObject({ variant, colours: 'spectrum', outlined: true });
        expect(editor.state.doc.nodeAt(stepPositions()[0])!.attrs.icon).toBe('🧪');
      }
    }
  });

  it('is a note block: selectable whole, framed, with its designs on Ctrl+] / Ctrl+[', () => {
    expect(NOTE_BLOCK_NODES.has('steps')).toBe(true);
    expect(BLOCK_DESIGN_LISTS.steps.map((d) => d.id)).toEqual([...STEPS_VARIANTS]);
  });
});
