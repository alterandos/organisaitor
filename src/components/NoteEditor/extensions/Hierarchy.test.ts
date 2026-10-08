// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { HierarchyExtensions, setHierarchySettings } from './Hierarchy';
import { PyramidExtensions, deleteLayer, layerWidths, setPyramidSettings } from './Pyramid';
import { effectiveLevels, hierarchyLayout, subtreeEnd } from './hierarchyLayout';
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
      ...HierarchyExtensions, ...PyramidExtensions],
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
const posOf = (name: string) => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === name) p = pos; }); return p; };
const outline = () => {
  const out: string[] = [];
  editor.state.doc.nodeAt(posOf('hierarchy'))!.forEach((item) => out.push(`${item.attrs.level}:${item.textContent}`));
  return out.join(' ');
};

describe('hierarchy layout', () => {
  it('reads a tree from the flat levels: parents, spans across the leaves, siblings', () => {
    //  Animalia ─┬─ Chordata ─┬─ Mammalia
    //            │            └─ Aves
    //            └─ Arthropoda
    const { places, depth, leaves } = hierarchyLayout([0, 1, 2, 2, 1]);
    expect(depth).toBe(3);
    expect(leaves).toBe(3);
    expect(places.map((p) => p.parent)).toEqual([null, 0, 1, 1, 0]);
    expect(places.map((p) => [p.start, p.end])).toEqual([[0, 3], [0, 2], [0, 1], [1, 2], [2, 3]]);
    expect(places.map((p) => p.siblings)).toEqual(['only', 'first', 'first', 'last', 'last']);
    expect(places.map((p) => p.hasChildren)).toEqual([true, true, false, false, false]);
    expect(places[4].sinceAbove).toBe(3);     // the elbow reaches back past Chordata's children
  });

  it('makes any stored levels hang together, and finds what an item carries with it', () => {
    expect(effectiveLevels([2, 5, 1, 3])).toEqual([0, 1, 1, 2]);
    expect(subtreeEnd([0, 1, 2, 2, 1], 1)).toBe(4);
    expect(subtreeEnd([0, 1, 2, 2, 1], 4)).toBe(5);
  });
});

describe('hierarchy block', () => {
  it('`\\taxonomy` starts a top item with two below it; written as an outline with Enter and Tab', () => {
    make();
    type('\\taxonomy ');
    expect(editor.state.selection.$from.parent.type.name).toBe('hierarchyItem');
    type('Animalia');
    press('Enter');                        // into the empty item waiting below
    type('Chordata');
    press('Enter');
    type('Mammalia');
    press('Tab');                          // under Chordata
    press('Enter');
    type('Aves');
    expect(outline()).toBe('0:Animalia 1:Chordata 2:Mammalia 2:Aves');
    press('Tab');
    press('Tab');                          // can't go two below the item before it
    expect(outline()).toBe('0:Animalia 1:Chordata 2:Mammalia 3:Aves');
    press('Tab', true);
    expect(outline()).toBe('0:Animalia 1:Chordata 2:Mammalia 2:Aves');
  });

  it('Shift+Tab takes an item’s children with it; Enter on an empty item moves it up, then out', () => {
    make();
    type('\\hierarchy Root');
    press('Enter');
    type('A');
    press('Enter');
    type('A1');
    press('Tab');
    // Back to A, and up a level: A1 comes too.
    editor.commands.setTextSelection(posOf('hierarchy') + 1 + editor.state.doc.nodeAt(posOf('hierarchy'))!.child(0).nodeSize + 2);
    press('Tab', true);
    expect(outline()).toBe('0:Root 0:A 1:A1');
    // A new empty item: Enter moves it up a level, then (at the top) out of the block.
    editor.commands.focus('end');
    press('Enter');
    expect(outline()).toBe('0:Root 0:A 1:A1 1:');
    press('Enter');
    expect(outline()).toBe('0:Root 0:A 1:A1 0:');
    press('Enter');
    expect(outline()).toBe('0:Root 0:A 1:A1');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('names its levels, and copies as an indented list with them', () => {
    make();
    type('\\hierarchy Animalia');
    press('Enter');
    type('Chordata');
    press('Enter');
    type('Arthropoda');
    setHierarchySettings(editor.view, posOf('hierarchy'), { tiers: ['Kingdom', 'Phylum'], variant: 'columns', colours: 'spectrum' });
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size)))
      .toBe('- Kingdom: Animalia\n  - Phylum: Chordata\n  - Phylum: Arthropoda');
    const tiers = [...editor.view.dom.querySelectorAll('[data-hi-tier]')].map((b) => b.textContent);
    expect(tiers).toEqual(['Kingdom', 'Phylum']);
    for (const content of [editor.getJSON(), editor.getHTML()]) {
      editor.commands.setContent(content);
      expect(editor.state.doc.nodeAt(posOf('hierarchy'))!.attrs).toMatchObject({ variant: 'columns', colours: 'spectrum', tiers: ['Kingdom', 'Phylum'] });
      expect(outline()).toBe('0:Animalia 1:Chordata 1:Arthropoda');
    }
  });
});

describe('pyramid block', () => {
  it('`\\maslow` makes three layers, top first; Enter walks label → note → next layer', () => {
    make();
    type('\\maslow ');
    expect(editor.state.selection.$from.parent.type.name).toBe('pyramidLabel');
    type('Self-actualisation');
    press('Enter');
    type('Becoming who you can be');
    press('Enter');
    type('Esteem');
    press('Enter');
    press('Enter');                        // its note is empty: on to the third
    type('Belonging');
    press('Enter');
    press('Enter');                        // and past the last: a new layer
    type('Safety');
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size)))
      .toBe('Pyramid, top to bottom:\n1. Self-actualisation — Becoming who you can be\n2. Esteem\n3. Belonging\n4. Safety');
  });

  it('keeps at least two layers; shapes narrow to the top (or to a spout, as a funnel)', () => {
    make();
    type('\\pyramid Top');
    const layers = () => { const out: number[] = []; editor.state.doc.descendants((n, p) => { if (n.type.name === 'pyramidLayer') out.push(p); }); return out; };
    expect(deleteLayer(editor.view, layers()[2])).toBe(true);
    expect(deleteLayer(editor.view, layers()[1])).toBe(false);
    expect(layerWidths('pyramid', 0, 4)).toEqual({ top: 0, bottom: 0.25 });
    expect(layerWidths('funnel', 3, 4).bottom).toBeCloseTo(0.28);
    expect(layerWidths('stacked', 3, 4)).toEqual({ top: 1, bottom: 1 });
    setPyramidSettings(editor.view, posOf('pyramid'), { variant: 'funnel', colours: 'spectrum' });
    editor.commands.setContent(editor.getHTML());
    expect(editor.state.doc.nodeAt(posOf('pyramid'))!.attrs).toMatchObject({ variant: 'funnel', colours: 'spectrum' });
  });
});
