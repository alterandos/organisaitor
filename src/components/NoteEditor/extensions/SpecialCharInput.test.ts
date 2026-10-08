// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SpecialCharInput } from './SpecialCharInput';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;
Element.prototype.scrollIntoView = () => {};

let editor: Editor;
afterEach(() => { editor?.destroy(); document.body.replaceChildren(); });

function make(content = '<p></p>') {
  const el = document.createElement('div');
  document.body.append(el);
  editor = new Editor({ element: el, extensions: [StarterKit, SpecialCharInput], content });
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

describe('//name in the note editor', () => {
  it('the whole name and a space becomes the letter', () => {
    make();
    type('wavelength //lambda and //Omega ');
    expect(editor.getText()).toBe('wavelength λ and Ω ');
  });

  it('Enter puts in the highlighted letter while a name is part-typed', () => {
    make();
    editor.view.hasFocus = () => true;
    type('angle //th');
    expect(press('Enter')).toBe(true);
    expect(editor.getText()).toBe('angle θ');
  });

  it('not in code, and not in a URL', () => {
    make('<pre><code></code></pre>');
    type('//alpha ');
    expect(editor.getText()).toContain('//alpha ');
    expect(editor.getText()).not.toContain('α');
    make();
    type('https://alpha ');
    expect(editor.getText()).toBe('https://alpha ');
  });
});
