// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { CaseStudyExtensions, toggleCaseField, fieldsOf } from './CaseStudy';
import { CauseEffectExtensions, ceItems, linkItems, addCeColumn } from './CauseEffect';
import { VennExtensions, toggleItemSet, toggleThirdSet, setCount } from './Venn';
import { chainOf, toggleLink, parseLinks, fishboneLayout } from './causeEffectChain';
import { vennLayout, regionOf } from './vennLayout';
import { DesignCycle } from './designCycle';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';

// The case study, cause and effect, and Venn blocks (2026-10-23): made through `\`, their keys,
// their links and sets, designs, copying, and a round trip through HTML; and the pure rules
// (causeEffectChain.ts, vennLayout.ts).

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content = '<p></p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...CaseStudyExtensions, ...CauseEffectExtensions, ...VennExtensions, DesignCycle],
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
const find = (name: string): { node: PMNode; pos: number } => {
  let out = { node: null as unknown as PMNode, pos: -1 };
  editor.state.doc.descendants((n, p) => { if (out.pos < 0 && n.type.name === name) out = { node: n, pos: p }; });
  return out;
};
const clip = () => noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size));

describe('the pure rules', () => {
  it('a chain runs forward and back along links, not sideways', () => {
    const links = [{ from: 'a', to: 'x' }, { from: 'b', to: 'x' }, { from: 'b', to: 'y' }, { from: 'x', to: 'z' }];
    expect([...chainOf('a', links)].sort()).toEqual(['a', 'x', 'z']);
    expect([...chainOf('x', links)].sort()).toEqual(['a', 'b', 'x', 'z']);
    expect(toggleLink(links, 'a', 'x')).toHaveLength(3);
    expect(toggleLink([], 'a', 'x')).toEqual([{ from: 'a', to: 'x' }]);
    expect(parseLinks('nonsense')).toEqual([]);
  });

  it('fishbone: the last column is the head, the one before the main bones (above and below in turn), earlier items small bones on the bone they lead to', () => {
    const cols = [['fuel', 'farm', 'lone'], ['co2', 'ch4', 'soot'], ['warm']];
    const links = [{ from: 'fuel', to: 'co2' }, { from: 'farm', to: 'ch4' }, { from: 'co2', to: 'warm' }];
    const fb = fishboneLayout(cols, links);
    expect(fb.place.warm).toMatchObject({ role: 'head', col: fb.slots + 1, row: fb.spineRow });
    expect(fb.place.co2).toMatchObject({ role: 'major', side: 'top', row: 1, col: 1 });
    expect(fb.place.ch4).toMatchObject({ role: 'major', side: 'bottom', col: 1 });
    expect(fb.place.fuel).toMatchObject({ role: 'minor', major: 'co2', side: 'top', row: 2 });
    expect(fb.place.farm).toMatchObject({ role: 'minor', major: 'ch4', side: 'bottom' });
    expect(fb.place.lone).toMatchObject({ role: 'major' });          // leads to no main bone: a bone of its own
    expect(fb.slots).toBe(2);
    expect(fishboneLayout([['a', 'b'], ['x']], []).place.a).toMatchObject({ role: 'major' });
  });

  it('Venn regions and places: each thing at its region’s middle, several stacked, none along the foot', () => {
    expect(regionOf(['b', 'a'], 2)).toBe('ab');
    expect(regionOf(['c'], 2)).toBe('');
    const l = vennLayout(2, [['a'], ['a', 'b'], ['a', 'b'], []]);
    expect(l.circles).toHaveLength(2);
    expect(l.items[0].x).toBeLessThan(l.items[1].x);
    expect(l.items[1].x).toBe(l.items[2].x);
    expect(l.items[1].y).not.toBe(l.items[2].y);
    expect(l.items[3].y).toBeGreaterThan(80);
    expect(vennLayout(3, [['a', 'b', 'c']]).items[0].x).toBe(50);
    expect(vennLayout(2, [['a']]).h).toBeLessThan(l.h);   // no strip for things in no set when there are none
  });
});

describe('case study', () => {
  it('`\\case`: title, then Enter through the parts and out; a part hidden keeps its text; copied as text', () => {
    make();
    type('\\case ');
    type('The Montreal Protocol');
    press('Enter');
    type('1987, 46 countries');
    press('Enter');
    type('CFCs were thinning the ozone layer');
    const { node, pos } = find('caseStudy');
    expect(node.attrs.variant).toBe('card');
    expect(fieldsOf(node)).toEqual(['setting', 'situation', 'actions', 'outcome', 'shows']);
    toggleCaseField(editor.view, pos, 'setting');
    expect(fieldsOf(find('caseStudy').node)).not.toContain('setting');
    toggleCaseField(editor.view, find('caseStudy').pos, 'setting');
    expect(find('caseStudy').node.child(1).textContent).toBe('1987, 46 countries');
    expect(clip()).toContain('Case study: The Montreal Protocol');
    expect(clip()).toContain('Situation: CFCs were thinning the ozone layer');
    const html = editor.getHTML();
    make(html);
    expect(find('caseStudy').node.child(0).textContent).toBe('The Montreal Protocol');
    const title = find('caseStudy').pos + 2;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, title + 3)));
    press(']', { ctrlKey: true });
    expect(find('caseStudy').node.attrs.variant).toBe('report');
  });
});

describe('cause and effect', () => {
  it('`\\cause`: Causes and Effects; Enter adds items, an empty one moves on; links toggle and copy; ids stay unique', () => {
    make();
    type('\\cause ');
    type('Deforestation');
    press('Enter');
    type('Burning fossil fuels');
    press('Enter');
    press('Enter');                       // an empty cause: on to the effects
    type('Warming');
    let { node, pos } = find('causeEffect');
    let cols = ceItems(node);
    expect(cols.map((c) => c.map((i) => i.text))).toEqual([['Deforestation', 'Burning fossil fuels'], ['Warming']]);
    expect(new Set(cols.flat().map((i) => i.cid)).size).toBe(3);
    linkItems(editor.view, pos, cols[0][0].cid, cols[1][0].cid);
    linkItems(editor.view, pos, cols[0][1].cid, cols[1][0].cid);
    expect(find('causeEffect').node.attrs.links).toHaveLength(2);
    expect(clip()).toContain('- Warming (from Deforestation, Burning fossil fuels)');
    linkItems(editor.view, find('causeEffect').pos, cols[0][1].cid, cols[1][0].cid);
    expect(find('causeEffect').node.attrs.links).toHaveLength(1);
    addCeColumn(editor.view, find('causeEffect').pos);
    expect(find('causeEffect').node.childCount).toBe(3);
    const html = editor.getHTML();
    make(html);
    ({ node, pos } = find('causeEffect'));
    cols = ceItems(node);
    expect(node.attrs.links).toEqual([{ from: cols[0][0].cid, to: cols[1][0].cid }]);
    expect(pos).toBeGreaterThanOrEqual(0);
  });

  it('a pasted copy gets fresh ids, so its links don’t tie into the original', () => {
    make('<div data-type="cause-effect"><div data-ce-column><div data-ce-head>A</div><div data-ce-item data-cid="x1">one</div><div data-ce-item data-cid="x1">two</div></div><div data-ce-column><div data-ce-head>B</div><div data-ce-item data-cid="">three</div></div></div>');
    editor.view.dispatch(editor.state.tr.insertText(' '));   // any change lets the fixer run
    const ids = ceItems(find('causeEffect').node).flat().map((i) => i.cid);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every(Boolean)).toBe(true);
  });
});

describe('Venn diagram', () => {
  it('`\\venn`: two sets; things in sets; Enter keeps the sets; a third set and back; designs; copied as text', () => {
    make();
    type('\\venn ');
    type('Mammals');
    press('Enter');
    type('Ocean');
    press('Enter');                       // from the last set: a first thing, in the first set
    type('Dog');
    press('Enter');
    type('Whale');
    let { node } = find('vennBlock');
    expect(setCount(node)).toBe(2);
    const items: { pos: number; sets: string[]; text: string }[] = [];
    editor.state.doc.descendants((n, p) => { if (n.type.name === 'vennItem') items.push({ pos: p, sets: n.attrs.sets, text: n.textContent }); });
    expect(items.map((i) => [i.text, i.sets])).toEqual([['Dog', ['a']], ['Whale', ['a']]]);
    toggleItemSet(editor.view, items[1].pos, 'b');
    expect(clip()).toContain('- Whale: Mammals, Ocean');
    toggleThirdSet(editor.view, find('vennBlock').pos);
    expect(setCount(find('vennBlock').node)).toBe(3);
    toggleThirdSet(editor.view, find('vennBlock').pos);
    expect(setCount(find('vennBlock').node)).toBe(2);
    editor.commands.setNodeSelection(find('vennBlock').pos);
    press(']', { ctrlKey: true });
    expect(find('vennBlock').node.attrs.variant).toBe('table');
    const html = editor.getHTML();
    make(html);
    ({ node } = find('vennBlock'));
    expect(node.attrs.variant).toBe('table');
    expect(node.lastChild!.attrs.sets).toEqual(['a', 'b']);
  });
});
