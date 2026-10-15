// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { ProsConsExtensions, PROSCONS_VARIANTS, listWeight, scalesTilt, setPointWeight, setProsConsVariant } from './ProsCons';
import { OptionsExtensions, OPTIONS_VARIANTS, ranks, setOptionAttrs, setOptionsVariant, optionPos } from './Options';
import { DesignCycle, cycleBlockDesign, nextDesign } from './designCycle';
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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...ProsConsExtensions, ...OptionsExtensions, DesignCycle],
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
function press(key: string, opts: KeyboardEventInit = {}) {
  const view = editor.view;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  return view.someProp('handleKeyDown', (f) => f(view, event)) ?? false;
}
const find = (name: string) => { let pos = -1; editor.state.doc.descendants((n, p) => { if (pos < 0 && n.type.name === name) pos = p; }); return pos; };
const node = (name: string) => editor.state.doc.nodeAt(find(name))!;
const lists = () => [1, 2].map((i) => { const l: string[] = []; node('prosCons').child(i).forEach((p) => l.push(p.textContent)); return l; });

describe('pros and cons block', () => {
  it('`\\proscons`: subject → pros (Enter adds the next) → empty point → cons → verdict → out', () => {
    make();
    type('\\proscons ');
    type('Move to Leeds?');
    press('Enter');
    type('Cheaper rent');
    press('Enter');
    type('New job');
    press('Enter');
    press('Enter');                   // an empty pro: on to the cons
    type('Far from friends');
    press('Enter');
    press('Enter');                   // an empty con: on to the verdict
    type('Go');
    press('Enter');                   // out of the block
    type('After');
    expect(node('prosCons').child(0).textContent).toBe('Move to Leeds?');
    expect(lists()).toEqual([['Cheaper rent', 'New job'], ['Far from friends']]);
    expect(node('prosCons').child(3).textContent).toBe('Go');
    expect(editor.state.doc.textContent.endsWith('After')).toBe(true);
  });

  it('weights sum per side, and the scales tip towards the heavier side', () => {
    make();
    type('\\proscons ');
    type('X');
    press('Enter');
    type('A');
    let pointPos = -1;
    editor.state.doc.descendants((n, p) => { if (pointPos < 0 && n.type.name === 'prosConsPoint') pointPos = p; });
    setPointWeight(editor.view, pointPos, 3);
    expect(listWeight(node('prosCons').child(1))).toBe(3);
    expect(scalesTilt(3, 0)).toBeLessThan(0);
    expect(scalesTilt(0, 2)).toBeGreaterThan(0);
    expect(scalesTilt(20, 0)).toBe(-14);
    setProsConsVariant(editor.view, find('prosCons'), 'scales');
    expect(editor.view.dom.querySelector('[data-pc-scales]')).not.toBeNull();
    expect(editor.view.dom.querySelector('[data-type="proscons"]')?.getAttribute('data-pc-net')).toBe('Net +3');
  });

  it('every design round-trips through JSON and HTML, weights kept; copies as + / − lines', () => {
    make();
    type('\\proscons ');
    type('X');
    press('Enter');
    type('Good');
    press('Enter');
    press('Enter');
    type('Bad');
    for (const v of PROSCONS_VARIANTS) {
      setProsConsVariant(editor.view, find('prosCons'), v);
      const before = lists();
      const html = editor.getHTML();
      const json = editor.getJSON();
      editor.commands.setContent(html);
      expect(node('prosCons').attrs.variant).toBe(v);
      expect(lists()).toEqual(before);
      editor.commands.setContent(json);
      expect(lists()).toEqual(before);
    }
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('X\n+ Good\n− Bad');
  });
});

describe('options block', () => {
  it('`\\options`: goal → name → note → pros → cons → the next option; an empty option leaves', () => {
    make();
    type('\\options ');
    type('Cut emissions');
    press('Enter');
    type('Carbon tax');
    press('Enter');
    type('Price it');
    press('Enter');
    type('Efficient');
    press('Enter');
    press('Enter');                   // on to its cons
    type('Regressive');
    press('Enter');
    press('Enter');                   // on to the next option's name
    type('Subsidies');
    const names: string[] = [];
    node('options').forEach((c, _o, i) => { if (i > 0) names.push(c.child(0).textContent); });
    expect(names).toEqual(['Carbon tax', 'Subsidies', '']);
  });

  it('designs that just list the options skip the pros and cons with Enter (they stay stored)', () => {
    make();
    type('\\options ');
    setOptionsVariant(editor.view, find('options'), 'tiles');
    type('Ways to work');
    press('Enter');
    type('Bus');
    press('Enter');
    type('Cheap');
    press('Enter');                   // straight on to the next option's name
    type('Bike');
    const names: string[] = [];
    node('options').forEach((c, _o, i) => { if (i > 0) names.push(c.child(0).textContent); });
    expect(names).toEqual(['Bus', 'Bike', '']);
  });

  it('ranks by score, best first; status and score round-trip through every design', () => {
    make();
    type('\\options ');
    const o = node('options');
    setOptionAttrs(editor.view, optionPos(o, find('options'), 1), { score: 4, status: 'chosen' });
    setOptionAttrs(editor.view, optionPos(node('options'), find('options'), 2), { score: 2 });
    expect(ranks(node('options'))).toEqual([2, 0, 1]);   // scores 0, 4, 2: the second is first
    for (const v of OPTIONS_VARIANTS) {
      setOptionsVariant(editor.view, find('options'), v);
      editor.commands.setContent(editor.getHTML());
      expect(node('options').attrs.variant).toBe(v);
      expect(node('options').child(2).attrs).toMatchObject({ score: 4, status: 'chosen' });
    }
  });
});

describe('Ctrl+] / Ctrl+[ cycle a block’s designs', () => {
  it('next and previous, wrapping round, from inside the block or with it selected', () => {
    make();
    type('\\proscons ');
    expect(node('prosCons').attrs.variant).toBe('tchart');
    expect(press(']', { ctrlKey: true })).toBe(true);
    expect(node('prosCons').attrs.variant).toBe('scales');
    press('[', { ctrlKey: true });
    press('[', { ctrlKey: true });
    expect(node('prosCons').attrs.variant).toBe('ledger');   // wrapped round
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, find('prosCons'))));
    cycleBlockDesign(editor.view, 1);
    expect(node('prosCons').attrs.variant).toBe('tchart');
    expect(editor.state.selection instanceof NodeSelection).toBe(true);
    expect(nextDesign(node('prosCons'), -1)?.id).toBe('ledger');
  });

  it('does nothing outside a block', () => {
    make('<p>Plain</p>');
    expect(press(']', { ctrlKey: true })).toBe(false);
  });
});
