// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { ProsConsExtensions } from './ProsCons';
import { DesignCycle } from './designCycle';
import { NumberNotation } from './NumberNotation';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';

// Ctrl+] / Ctrl+[ on a number (extensions/NumberNotation.ts): its next form, one undo step; inside
// a note block only a selected number, since there the keys cycle the block's design.

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...ProsConsExtensions, DesignCycle, NumberNotation],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId: 'n', collectionId: null, now: new Date() });
}
const text = () => editor.getText().trim();
function type(t: string) {
  for (const ch of t) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
function press(key: string) {
  const view = editor.view;
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
  return view.someProp('handleKeyDown', (f) => f(view, event)) ?? false;
}
function cursorAt(text: string, offset = 1) {
  let pos = -1;
  editor.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text!.includes(text)) pos = p + n.text!.indexOf(text) + offset; });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
}

describe('a number written another way', () => {
  it('the cursor on a number: Ctrl+] steps on, Ctrl+[ back, and Undo puts it back', () => {
    make('<p>Emissions were 69000000000 tonnes.</p>');
    cursorAt('69000000000', 3);
    expect(press(']')).toBe(true);
    expect(text()).toBe('Emissions were 69,000,000,000 tonnes.');
    press(']');
    expect(text()).toBe('Emissions were 6.9×10¹⁰ tonnes.');
    press(']');
    expect(text()).toBe('Emissions were 6.9E10 tonnes.');
    press('[');
    expect(text()).toBe('Emissions were 6.9×10¹⁰ tonnes.');
    editor.commands.undo();
    expect(text()).toBe('Emissions were 6.9E10 tonnes.');
  });

  it('away from a number the keys do nothing here', () => {
    make('<p>No numbers here.</p>');
    cursorAt('numbers');
    expect(press(']')).toBe(false);
  });

  it('inside a block the keys cycle its design, unless the number is selected', () => {
    make('<p></p>');
    editor.commands.focus('end');
    type('\\proscons ');
    type('Pay 25000 a year?');
    const variant = () => { let v = ''; editor.state.doc.descendants((n) => { if (n.type.name === 'prosCons') v = n.attrs.variant; }); return v; };
    const before = variant();
    cursorAt('25000', 2);
    press(']');
    expect(variant()).not.toBe(before);
    expect(text()).toContain('25000');
    let pos = -1;
    editor.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text!.includes('25000')) pos = p + n.text!.indexOf('25000'); });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos, pos + 5)));
    press(']');
    expect(text()).toContain('25,000');
  });
});
