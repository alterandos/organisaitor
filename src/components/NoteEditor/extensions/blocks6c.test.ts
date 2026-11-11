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
import { NoteBlockKeys } from './blockDesigns';
import { BlockImportance } from './BlockImportance';
import { BlockFlags } from './BlockFlags';
import { parseNoteContent } from '@/utils/noteContent';

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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...CaseStudyExtensions, ...CauseEffectExtensions, ...VennExtensions, DesignCycle, NoteBlockKeys, BlockImportance, BlockFlags],
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
    press('Enter');   // a new line in the part, then Enter on it moves on
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

  // The shared block keys and card look (2026-11-11: the case study had drifted from the cards).
  it('Ctrl+Enter in a part leaves it as it is onto a new line below; a list never turns a part into another', () => {
    make();
    type('\\case ');
    type('The Montreal Protocol');
    for (let i = 0; i < 5; i++) press('Enter');
    type('Global bans can work');
    const shows = () => find('caseStudy').node.lastChild!;
    expect(shows().attrs.field).toBe('shows');
    // A long part holds bullets (2026-11-11): the line becomes one, and the part stays what it was.
    expect(editor.commands.toggleBulletList()).toBe(true);
    expect(shows().attrs.field).toBe('shows');
    expect(shows().firstChild!.type.name).toBe('bulletList');
    expect(press('Enter', { ctrlKey: true })).toBe(true);
    expect(shows().textContent).toBe('Global bans can work');
    expect(shows().childCount).toBe(1);   // no line break put in
    const $sel = editor.state.selection.$from;
    expect($sel.parent.type.name).toBe('paragraph');
    expect($sel.pos).toBe(find('caseStudy').pos + find('caseStudy').node.nodeSize + 1);
  });

  it('a long part’s keys: Enter a new line or bullet, on an empty last line the next part; Tab indents a bullet; Backspace steps back', () => {
    make();
    type('\\case ');
    type('Feed-in tariffs');
    press('Enter');                     // the title, then Setting
    type('Germany, 2000');
    press('Enter');
    type('Then Spain');
    const setting = () => find('caseStudy').node.child(1);
    expect(setting().childCount).toBe(2);
    expect(setting().textContent).toBe('Germany, 2000Then Spain');
    press('Enter');
    press('Enter');                     // the empty last line goes, and on to Situation
    expect(setting().childCount).toBe(2);
    expect(editor.state.selection.$from.node(-1).attrs.field).toBe('situation');
    type('- ');                         // Markdown's bullet
    type('Prices fell');
    press('Enter');
    type('Panels spread');
    const situation = () => find('caseStudy').node.child(2);
    expect(situation().firstChild!.type.name).toBe('bulletList');
    expect(situation().firstChild!.childCount).toBe(2);
    expect(press('Tab')).toBe(true);    // the second bullet goes under the first
    expect(situation().firstChild!.childCount).toBe(1);
    press('Enter');
    press('Enter');                     // an empty bullet: out of the list, then on
    press('Enter');
    press('Enter');
    expect(editor.state.selection.$from.node(-1).attrs.field).toBe('actions');
    press('Backspace');                 // at the start of an empty part: back to the one before
    expect(editor.state.selection.$from.node(-1).type.name).not.toBe('caseField');
  });

  it('a case study stored before parts held lines is read with each part’s text in a line', () => {
    const old = JSON.stringify({ type: 'doc', content: [{ type: 'section', content: [{ type: 'caseStudy', content: [
      { type: 'caseTitle', content: [{ type: 'text', text: 'Old' }] },
      { type: 'caseField', attrs: { field: 'shows' }, content: [{ type: 'text', text: 'It still reads' }] },
    ] }] }] });
    make();
    editor.commands.setContent(parseNoteContent(old));
    const shows = find('caseStudy').node.child(1);
    expect(shows.firstChild!.type.name).toBe('paragraph');
    expect(shows.textContent).toBe('It still reads');
  });

  it('is drawn in the shared card look, its kind line saying its level of Important and showing Clarify later', () => {
    make();
    type('\\case ');
    type('Feed-in tariffs');
    const { pos, node } = find('caseStudy');
    const dom = () => editor.view.nodeDOM(find('caseStudy').pos) as HTMLElement;
    expect(dom().getAttribute('data-card-look')).toBe('card');
    expect(dom().querySelector('[data-card-part="kind"]')!.textContent).toBe('Case study');
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, importance: 1, clarify: 'c1' }));
    const kind = dom().querySelector('[data-card-part="kind"]')!;
    expect(kind.textContent).toContain('⭐');
    expect(kind.querySelector('[data-card-flag="clarify"]')).not.toBeNull();
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...find('caseStudy').node.attrs, variant: 'report' }));
    expect(dom().hasAttribute('data-card-look')).toBe(false);
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

  it('a thing left empty goes when the cursor leaves it; one being written in stays', () => {
    make();
    type('\\venn ');
    type('Mammals');
    press('Enter');
    type('Ocean');
    press('Enter');                       // an empty thing, the cursor in it
    const count = () => { let n = 0; find('vennBlock').node.forEach((c) => { if (c.type.name === 'vennItem') n++; }); return n; };
    expect(count()).toBe(1);
    editor.commands.setTextSelection(find('vennBlock').pos + 3);   // into the first set's name
    expect(count()).toBe(0);
    expect(editor.state.doc.textContent).toContain('Mammals');
  });
});
