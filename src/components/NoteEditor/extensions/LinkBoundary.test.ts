// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { LinkBoundary } from './LinkBoundary';

let editor: Editor;
afterEach(() => editor?.destroy());

function make(html: string) {
  editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, LinkBoundary], content: html });
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
const linked = () => {
  const out: string[] = [];
  editor.state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.type.name === 'link')) out.push(n.text!); });
  return out.join('');
};

describe('a space ends a link', () => {
  it('text typed after a space at the end of a link is not part of it', () => {
    make('<p><a href="https://example.com/a">https://example.com/a</a></p>');
    type(' and more');
    expect(linked()).toBe('https://example.com/a');
    expect(editor.state.doc.textContent).toBe('https://example.com/a and more');
  });

  it('a space inside a link stays linked', () => {
    make('<p><a href="https://x.y">ab</a></p>');
    editor.commands.setTextSelection(2);
    type(' ');
    expect(linked()).toBe('a b');
  });
});
