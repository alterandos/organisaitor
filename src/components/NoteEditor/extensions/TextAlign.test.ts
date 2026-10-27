// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextAlign, cycleTextAlign, setTextAlign, textAlignAt } from './TextAlign';

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content: string) {
  editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, TextAlign], content });
}
const aligns = () => { const out: (string | null)[] = []; editor.state.doc.forEach((n) => out.push(n.attrs.textAlign ?? null)); return out; };

describe('text alignment', () => {
  it('aligns every paragraph and heading the selection touches; left is stored as nothing', () => {
    make('<h2>Title</h2><p>One</p><p>Two</p>');
    editor.commands.setTextSelection({ from: 2, to: editor.state.doc.content.size - 1 });
    setTextAlign(editor.view, 'center');
    expect(aligns()).toEqual(['center', 'center', 'center']);
    setTextAlign(editor.view, 'left');
    expect(aligns()).toEqual([null, null, null]);
  });

  it('Ctrl+Shift+] / [ step left → centre → right → justified and round', () => {
    make('<p>One</p>');
    editor.commands.setTextSelection(2);
    cycleTextAlign(editor.view, 1);
    expect(textAlignAt(editor.state)).toBe('center');
    cycleTextAlign(editor.view, 1);
    cycleTextAlign(editor.view, 1);
    expect(textAlignAt(editor.state)).toBe('justify');
    cycleTextAlign(editor.view, 1);
    expect(textAlignAt(editor.state)).toBe('left');
    cycleTextAlign(editor.view, -1);
    expect(textAlignAt(editor.state)).toBe('justify');
    const key = new KeyboardEvent('keydown', { key: '}', code: 'BracketRight', keyCode: 221, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, key));
    expect(textAlignAt(editor.state)).toBe('left');
  });

  it('round-trips through HTML as a text-align style', () => {
    make('<p style="text-align: right">One</p><p style="text-align: sideways">Two</p>');
    expect(aligns()).toEqual(['right', null]);
    expect(editor.getHTML()).toContain('text-align: right');
  });
});
