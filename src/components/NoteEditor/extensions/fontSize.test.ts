// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontSize } from '@tiptap/extension-text-style';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { NoteSubtitle, NoteAuthor } from './NoteBylines';
import { currentFontSize, setFontSize, stepFontSize } from './fontSize';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor.destroy());

function make(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, TextStyle, FontSize, NoteSubtitle, NoteAuthor],
    content,
  });
}

describe('font size', () => {
  it('steps up and down the ladder from the block’s own size, and stops at the ends', () => {
    make('<p>Some text</p><h1>Heading</h1>');
    editor.commands.setTextSelection({ from: 2, to: 6 });
    expect(currentFontSize(editor)).toBe(16);
    stepFontSize(editor, 1);
    expect(currentFontSize(editor)).toBe(18);
    stepFontSize(editor, 1);
    expect(editor.getHTML()).toContain('font-size: 20px');
    stepFontSize(editor, -1);
    stepFontSize(editor, -1);
    expect(currentFontSize(editor)).toBe(16);
    setFontSize(editor, 10);
    stepFontSize(editor, -1);
    expect(currentFontSize(editor)).toBe(10);
    setFontSize(editor, null);
    expect(editor.getHTML()).not.toContain('font-size');
    // A heading starts from its own size (27px): up is 28.
    editor.commands.setTextSelection({ from: 13, to: 18 });
    stepFontSize(editor, 1);
    expect(currentFontSize(editor)).toBe(28);
  });
});

describe('Subtitle and Author', () => {
  it('Enter at the end continues in ordinary text; both round-trip through HTML', () => {
    make('<div data-note-subtitle>A short look</div><div data-note-author>Jo Bloggs</div>');
    editor.commands.setTextSelection(1 + 1 + 'A short look'.length);
    const view = editor.view;
    view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    const html = editor.getHTML();
    expect(html).toContain('data-note-subtitle');
    expect(html).toContain('data-note-author');
    editor.commands.setContent(html);
    const names: string[] = [];
    editor.state.doc.forEach((s) => s.forEach((b) => names.push(b.type.name)));
    expect(names).toEqual(['noteSubtitle', 'paragraph', 'noteAuthor']);
  });
});
