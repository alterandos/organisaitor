// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Superscript from '@tiptap/extension-superscript';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import { NoteTagMark } from './NoteTagMark';
import { ArtifactLinkMark } from './ArtifactLinkMark';
import { setNormalText } from './normalText';

// jsdom has no layout; ProseMirror's scroll-into-view (on focus) asks for rects.
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor.destroy());

function make(html: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Superscript, TextStyle, Color, NoteTagMark, ArtifactLinkMark],
    content: html,
  });
}
const markNames = () => {
  const names = new Set<string>();
  editor.state.doc.descendants((n) => { n.marks.forEach((m) => names.add(m.type.name)); });
  return [...names].sort();
};

describe('setNormalText', () => {
  it('turns a heading into a paragraph and strips every formatting mark from it', () => {
    make('<h2><strong><em><u><s><span style="color: #ff0000">Exam</span></s></u></em></strong> <code>x</code><sup>2</sup></h2>');
    editor.commands.setTextSelection(2);
    setNormalText(editor);
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(markNames()).toEqual([]);
    expect(editor.getText().trim()).toBe('Exam x2');
  });

  it('keeps links, annotation tags and cross-app links', () => {
    make('<p><strong><a href="https://x.com">link</a></strong> <strong><mark data-tag-id="t1">tagged</mark></strong> <mark data-artifact-id="k" data-artifact-type="task">task</mark></p>');
    editor.commands.setTextSelection(2);
    setNormalText(editor);
    expect(markNames()).toEqual(['artifactLink', 'link', 'noteTag']);
  });

  it('with a selection, only clears the selected text', () => {
    make('<p><strong>one</strong> <strong>two</strong></p>');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    setNormalText(editor);
    const para = editor.state.doc.firstChild!;
    expect(para.child(0).marks).toHaveLength(0);
    expect(para.lastChild!.marks.map((m) => m.type.name)).toEqual(['bold']);
  });
});
