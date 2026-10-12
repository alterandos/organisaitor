// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { undo } from '@tiptap/pm/history';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { MathExtensions } from './Maths';
import { TrailingLine } from './TrailingLine';

let editor: Editor;
afterEach(() => editor?.destroy());

const make = (content: string) => {
  editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, ...MathExtensions, TrailingLine], content });
};
const lastOfSection = () => editor.state.doc.firstChild!.lastChild!.type.name;

describe('a line after the last block', () => {
  it('a block at the end of a note gets an empty line after it, once', () => {
    make('<p>x</p>');
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, { type: 'mathBlock', attrs: { latex: 'y' } });
    expect(lastOfSection()).toBe('paragraph');
    const n = editor.state.doc.firstChild!.childCount;
    editor.commands.insertContentAt(2, 'more ');
    expect(editor.state.doc.firstChild!.childCount).toBe(n);
  });

  it('a note that ends with text gets nothing added', () => {
    make('<p>x</p><p>y</p>');
    editor.commands.insertContentAt(2, 'z');
    expect(editor.state.doc.firstChild!.childCount).toBe(2);
  });

  it('is not an undo step: undo takes back the block, not just the line', () => {
    make('<p>x</p>');
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, { type: 'mathBlock', attrs: { latex: 'y' } });
    undo(editor.state, editor.view.dispatch);
    let blocks = 0;
    editor.state.doc.descendants((node) => { if (node.type.name === 'mathBlock') blocks++; });
    expect(blocks).toBe(0);
  });
});
