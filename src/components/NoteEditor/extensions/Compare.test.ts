// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { CompareExtensions, addCompareSide, compareCriteria, pointCriterion, removeCompareSide, setCompareVariant } from './Compare';
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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...CompareExtensions],
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
const press = (key: string, shiftKey = false) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))) ?? false;
const cPos = () => { let p = -1; editor.state.doc.descendants((n, pos) => { if (n.type.name === 'compareBlock') p = pos; }); return p; };
const block = () => editor.state.doc.nodeAt(cPos())!;
const sides = () => { const out: string[][] = []; block().forEach((s) => { const parts: string[] = []; s.forEach((p) => parts.push(p.textContent)); out.push(parts); }); return out; };

describe('comparison block', () => {
  it('`\\compare` makes two sides; Enter goes title → points, and an empty last point leaves; Tab moves between sides', () => {
    make();
    type('\\compare ');
    expect(sides()).toEqual([['', ''], ['', '']]);
    type('Renting');
    press('Enter');
    type('Price: $1,800 a month');
    press('Enter');
    type('Flexible');
    press('Tab');
    type('Buying');   // Tab went to the same row on the next side: its first point
    expect(sides()).toEqual([['Renting', 'Price: $1,800 a month', 'Flexible'], ['', 'Buying']]);
    press('Enter');
    expect(editor.state.selection.$from.parent.type.name).toBe('comparePoint');
    press('Enter');   // empty last point: gone, and out of the comparison
    expect(sides()[1]).toEqual(['', 'Buying']);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    press('Tab', true);   // Shift+Tab outside a comparison does nothing to it
    expect(sides()[0]).toEqual(['Renting', 'Price: $1,800 a month', 'Flexible']);
  });

  it('more sides can be added; a comparison keeps at least two', () => {
    make();
    type('\\compare A');
    addCompareSide(editor.view, cPos());
    expect(sides()).toHaveLength(3);
    removeCompareSide(editor.view, cPos(), 2);
    removeCompareSide(editor.view, cPos(), 1);
    expect(sides()).toHaveLength(2);
  });

  it('a point\'s criterion is the words before a colon; the Table lines the same criterion up on one row', () => {
    expect(pointCriterion('Price: $1,800')).toBe('Price');
    expect(pointCriterion('Meet at 10:30')).toBeNull();
    expect(pointCriterion('No colon here')).toBeNull();
    make(`<div data-type="compare" data-variant="table">
      <div data-cmp-side><div data-cmp-title>Renting</div><div data-cmp-point>Price: $1,800</div><div data-cmp-point>Flexible</div><div data-cmp-point>Commute: 20 min</div></div>
      <div data-cmp-side><div data-cmp-title>Buying</div><div data-cmp-point>Commute: 45 min</div><div data-cmp-point>price: $2,400</div></div>
    </div>`);
    expect(compareCriteria(block())).toEqual(['Price', 'Commute']);
    const rowOf = (text: string) => [...editor.view.dom.querySelectorAll<HTMLElement>('[data-cmp-point]')].find((el) => el.textContent === text)!.style.gridRow;
    expect(rowOf('Price: $1,800')).toBe(rowOf('price: $2,400'));
    expect(rowOf('Commute: 20 min')).toBe(rowOf('Commute: 45 min'));
    expect(rowOf('Flexible')).toBe('4');   // no criterion: after the criteria
    expect([...editor.view.dom.querySelectorAll('[data-cmp-row-head]')].map((el) => el.textContent)).toEqual(['Price', 'Commute']);
  });

  it('design round-trips through JSON and HTML; copies as text', () => {
    make();
    type('\\compare Renting');
    press('Enter');
    type('Flexible');
    setCompareVariant(editor.view, cPos(), 'proscons');
    for (const content of [editor.getJSON(), editor.getHTML()]) {
      editor.commands.setContent(content);
      expect(block().attrs.variant).toBe('proscons');
      expect(sides()).toEqual([['Renting', 'Flexible'], ['', '']]);
    }
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('Renting:\n- Flexible\nvs\nSide:');
  });
});
