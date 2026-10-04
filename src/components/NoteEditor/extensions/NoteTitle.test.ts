// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { HeadingNumbering } from './HeadingNumbering';
import { NoteTitle } from './NoteTitle';

// jsdom has no layout; ProseMirror's scroll-into-view asks for rects.
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor.destroy());

function make(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, HeadingNumbering, NoteTitle],
    content,
  });
}
const blocks = () => {
  const out: string[] = [];
  editor.state.doc.forEach((section) => section.forEach((b) => out.push(`${b.type.name}:${b.textContent}`)));
  return out;
};

describe('NoteTitle', () => {
  it('inserts the Title at the top of the tab, filled with the prefill, cursor at its end', () => {
    make('<p>Body text</p>');
    editor.commands.setTextSelection(5);
    editor.commands.insertOrFocusNoteTitle('Exams');
    expect(blocks()).toEqual(['noteTitle:Exams', 'paragraph:Body text']);
    expect(editor.isActive('noteTitle')).toBe(true);
    expect(editor.state.selection.from).toBe(1 + 1 + 'Exams'.length);
  });

  it('only ever one: a second call goes to the existing Title instead of adding another', () => {
    make('<p>Body</p>');
    editor.commands.insertOrFocusNoteTitle('Exams');
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    editor.commands.insertOrFocusNoteTitle('Other');
    expect(blocks()).toEqual(['noteTitle:Exams', 'paragraph:Body']);
    expect(editor.isActive('noteTitle')).toBe(true);
  });

  it('Enter in the Title continues in a normal paragraph', () => {
    make('<p></p>');
    editor.commands.insertOrFocusNoteTitle('Exams');
    editor.commands.keyboardShortcut('Enter');
    editor.commands.insertContent('next');
    expect(blocks().slice(0, 2)).toEqual(['noteTitle:Exams', 'paragraph:next']);
  });

  it('a Title arriving anywhere but the top (paste, drag) becomes Heading 1', () => {
    make('<p>One</p><p>Two</p>');
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, '<div data-note-title>Pasted</div>');
    expect(blocks()).not.toContain('noteTitle:Pasted');
    expect(blocks()).toContain('heading:Pasted');
  });

  it('is not counted by heading numbering', () => {
    make('<h1>First</h1>');
    editor.commands.insertOrFocusNoteTitle('Exams');
    expect(editor.view.dom.querySelector('h1')?.getAttribute('data-heading-number')).toBe('1');
  });
});
