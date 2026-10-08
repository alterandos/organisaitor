// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { SectionDocument, Section, ColumnBlock, Column } from './extensions/Section';
import { NoteTitle } from './extensions/NoteTitle';
import { NoteSubtitle, NoteAuthor } from './extensions/NoteBylines';
import { TimelineExtensions } from './extensions/Timeline';
import { noteClipboardText } from './noteClipboardText';

let editor: Editor;
afterEach(() => editor.destroy());

function make(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column,
      NoteTitle, NoteSubtitle, NoteAuthor, Table, TableRow, TableHeader, TableCell, ...TimelineExtensions,
    ],
    content,
  });
}
const copyAll = () => noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size));
const copy = (from: number, to: number) => noteClipboardText(editor.state.doc.slice(from, to));

describe('copying out of a note as plain text', () => {
  it('keeps headings, lists, quotes and paragraphs as Markdown', () => {
    make('<h2>Notes</h2><p>Some <a href="https://x.com">link</a> text.</p><ul><li><p>one</p><ul><li><p>nested</p></li></ul></li><li><p>two</p></li></ul><ol start="3"><li><p>third</p></li><li><p>fourth</p></li></ol><blockquote><p>wise words</p></blockquote>');
    expect(copyAll()).toBe([
      '## Notes',
      'Some link (https://x.com) text.',
      '- one\n  - nested\n- two',
      '3. third\n4. fourth',
      '> wise words',
    ].join('\n\n'));
  });

  it('a table pastes as tab-separated rows; a code block is fenced', () => {
    make('<table><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table><pre><code>x = 1</code></pre>');
    expect(copyAll()).toBe('A\tB\n1\t2\n\n```\nx = 1\n```');
  });

  it('timelines read as "- When — what"; the title, subtitle and author as lines', () => {
    make('<div data-note-title>Essay</div><div data-note-subtitle>A short look</div><div data-note-author>Jo Bloggs</div><div data-type="timeline"><div data-type="timeline-item"><div data-timeline-when>1914</div><p>War</p></div></div>');
    expect(copyAll()).toBe('# Essay\n\nA short look\n\nJo Bloggs\n\n- 1914 — War');
  });

  it('a few words from inside one heading or list item are just the words', () => {
    make('<h1>Big heading</h1><ul><li><p>bullet item</p></li></ul>');
    // doc > section > heading: "Big" is at 2..5.
    expect(copy(2, 5)).toBe('Big');
    const itemText = editor.state.doc.textContent.indexOf('bullet');
    let pos = -1;
    editor.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text?.startsWith('bullet')) pos = p; });
    expect(itemText).toBeGreaterThan(0);
    expect(copy(pos, pos + 6)).toBe('bullet');
  });
});
