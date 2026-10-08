// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { HeadingLevel } from './HeadingLevel';

let editor: Editor;
afterEach(() => editor.destroy());

function make(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, HeadingLevel],
    content,
  });
  editor.commands.focus('end');
}
// Ctrl+= / Ctrl+-: whether the editor took the key (if not, App.tsx zooms).
function press(key: '=' | '-') {
  const view = editor.view;
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
  return view.someProp('handleKeyDown', (f) => f(view, event)) ?? false;
}
const block = () => {
  const b = editor.state.selection.$from.parent;
  return b.type.name === 'heading' ? `h${b.attrs.level}` : b.type.name;
};

describe('Ctrl+= / Ctrl+− on a heading', () => {
  it('raises and lowers the level; H5 lowers to normal text; H1 stays', () => {
    make('<h3>Topic</h3>');
    expect(press('=')).toBe(true);
    expect(block()).toBe('h2');
    press('=');
    press('=');
    expect(block()).toBe('h1');
    for (let i = 0; i < 4; i++) press('-');
    expect(block()).toBe('h5');
    press('-');
    expect(block()).toBe('paragraph');
    expect(editor.state.doc.textContent).toBe('Topic');
  });

  it('leaves the keys to zoom anywhere else', () => {
    make('<p>Text</p>');
    expect(press('=')).toBe(false);
    expect(press('-')).toBe(false);
  });
});
