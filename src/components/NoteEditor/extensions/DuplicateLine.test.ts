// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { NoteTitle } from './NoteTitle';
import { DuplicateLine } from './DuplicateLine';

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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteTitle, DuplicateLine],
    content,
  });
}
const blocks = () => {
  const out: string[] = [];
  editor.state.doc.forEach((section) => section.forEach((b) => out.push(`${b.type.name}:${b.textContent}`)));
  return out;
};
// Position of `text`'s first character in the document.
function posOf(text: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.isText && node.text?.includes(text)) found = pos + node.text.indexOf(text);
  });
  return found;
}
const selectedText = () => editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);

describe('DuplicateLine (Alt+Shift+Down)', () => {
  it('copies the current paragraph below it and moves the cursor into the copy, same offset', () => {
    make('<p>alpha</p><p>beta</p>');
    editor.commands.setTextSelection(posOf('alpha') + 2);
    editor.commands.duplicateLineDown();
    expect(blocks()).toEqual(['paragraph:alpha', 'paragraph:alpha', 'paragraph:beta']);
    const { $from } = editor.state.selection;
    expect($from.parent.textContent).toBe('alpha');
    expect($from.index(1)).toBe(1); // the second (copied) block of the section
    expect($from.parentOffset).toBe(2);
  });

  it('keeps the line type and its marks (a heading stays a heading)', () => {
    make('<h2>Topic <strong>bold</strong></h2><p>x</p>');
    editor.commands.setTextSelection(posOf('Topic'));
    editor.commands.duplicateLineDown();
    expect(blocks()).toEqual(['heading:Topic bold', 'heading:Topic bold', 'paragraph:x']);
    expect(editor.getHTML().match(/<strong>bold<\/strong>/g)).toHaveLength(2);
  });

  it('a selection over several lines copies all of them, and the copy is selected', () => {
    make('<p>one</p><p>two</p><p>three</p>');
    editor.commands.setTextSelection({ from: posOf('one') + 1, to: posOf('two') + 2 });
    editor.commands.duplicateLineDown();
    expect(blocks()).toEqual(['paragraph:one', 'paragraph:two', 'paragraph:one', 'paragraph:two', 'paragraph:three']);
    expect(selectedText()).toBe('netw'); // "ne" + "tw": the same span, now in the copy
  });

  it('in a list, copies the whole bullet, not a second paragraph inside it', () => {
    make('<ul><li><p>first</p></li><li><p>second</p></li></ul>');
    editor.commands.setTextSelection(posOf('first') + 1);
    editor.commands.duplicateLineDown();
    const items: string[] = [];
    editor.state.doc.descendants((n) => { if (n.type.name === 'listItem') items.push(n.textContent); });
    expect(items).toEqual(['first', 'first', 'second']);
  });

  it('is bound to Alt+Shift+ArrowDown', () => {
    make('<p>alpha</p>');
    editor.commands.setTextSelection(posOf('alpha'));
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, shiftKey: true, bubbles: true }));
    expect(blocks()).toEqual(['paragraph:alpha', 'paragraph:alpha']);
  });
});
