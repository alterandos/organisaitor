// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AutoBrackets } from './AutoBrackets';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content = '<p></p>') {
  editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, AutoBrackets], content });
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
// The paragraph's text with the cursor drawn as |.
const shown = () => {
  const { from } = editor.state.selection;
  const p = editor.state.doc.firstChild!;
  const off = from - 1;
  return p.textContent.slice(0, off) + '|' + p.textContent.slice(off);
};

describe('brackets close themselves', () => {
  it('( [ { put in the pair with the cursor between', () => {
    make();
    type('f(');
    expect(shown()).toBe('f(|)');
    type('x[');
    expect(shown()).toBe('f(x[|])');
    type('{');
    expect(shown()).toBe('f(x[{|}])');
  });

  it('typing the closing bracket steps over the one put in', () => {
    make();
    type('(a)');
    expect(shown()).toBe('(a)|');
    type(')');
    expect(shown()).toBe('(a))|');      // no pair left: a second ) is typed as usual
  });

  it('Tab jumps past the closing bracket while inside the pair', () => {
    make();
    type('(abc');
    expect(press('Tab')).toBe(true);
    expect(shown()).toBe('(abc)|');
    expect(press('Tab')).toBeFalsy();   // outside now: Tab is the editor's again
  });

  it('Backspace straight after the opening bracket takes both away', () => {
    make();
    type('x(');
    press('Backspace');
    expect(shown()).toBe('x|');
  });

  it('before a word only one bracket goes in; with text selected the bracket wraps it', () => {
    make('<p>word</p>');
    editor.commands.setTextSelection(1);
    type('(');
    expect(shown()).toBe('(|word');
    make('<p>word</p>');
    editor.commands.setTextSelection({ from: 1, to: 5 });
    type('[');
    expect(editor.state.doc.textContent).toBe('[word]');
  });

  it('[[ leaves two opening brackets, for the note link picker', () => {
    make();
    type('[[');
    expect(shown()).toBe('[[|');
  });

  it('not in code', () => {
    make('<pre><code></code></pre>');
    type('(');
    expect(editor.state.doc.textContent).toBe('(');
  });
});
