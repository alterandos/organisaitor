// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { HeadingFold, computeHeadingFolds, setHeadingFoldLevel, toggleHeadingFold, toggleHeadingFoldAtCursor } from './HeadingFold';

// jsdom has no layout; ProseMirror's scroll-into-view asks for rects.
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

const NOTE = '<h1>One</h1><p>a</p><h2>One.One</h2><p>b</p><h1>Two</h1><p>c</p>';

function make(content = NOTE) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, HeadingFold],
    content,
  });
}

const headingPos = (text: string) => {
  let found = -1;
  editor.state.doc.descendants((n, pos) => { if (n.type.name === 'heading' && n.textContent === text) found = pos; });
  return found;
};
const collapsed = () => {
  const out: string[] = [];
  editor.state.doc.descendants((n) => { if (n.type.name === 'heading' && n.attrs.collapsed) out.push(n.textContent); });
  return out;
};
const hiddenTexts = () => [...editor.view.dom.querySelectorAll('[data-fold-hidden]')].map((el) => el.textContent);
const cursorIn = (text: string) => {
  let pos = -1;
  editor.state.doc.descendants((n, p) => { if (n.isTextblock && n.textContent === text) pos = p + 1; });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
};
const press = (key: string, mods: Partial<KeyboardEventInit> = {}) => {
  const view = editor.view;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
  return view.someProp('handleKeyDown', (f) => f(view, event)) ?? false;
};

describe('what a heading folds', () => {
  it('runs to the next heading of the same or a higher level', () => {
    make();
    const [one, oneOne, two] = computeHeadingFolds(editor.state.doc);
    expect(one.bodyTo).toBe(two.pos);
    expect(oneOne.bodyTo).toBe(two.pos);
    expect(two.bodyTo).toBeGreaterThan(two.bodyFrom);
  });

  it('stops at the end of its column', () => {
    make('<h1>Top</h1><p>x</p>');
    editor.commands.setSectionColumns(2, 0);
    const doc = editor.state.doc;
    const folds = computeHeadingFolds(doc);
    expect(folds).toHaveLength(1);
    // Inside a column the body can't run past the column's own end.
    const $h = doc.resolve(folds[0].pos);
    expect(folds[0].bodyTo).toBeLessThanOrEqual($h.end());
  });
});

describe('collapsing and expanding', () => {
  it('hides what is under a heading and nothing else', () => {
    make();
    toggleHeadingFold(editor.view, headingPos('One'));
    expect(collapsed()).toEqual(['One']);
    expect(hiddenTexts()).toEqual(['a', 'One.One', 'b']);
    toggleHeadingFold(editor.view, headingPos('One'));
    expect(collapsed()).toEqual([]);
    expect(hiddenTexts()).toEqual([]);
  });

  it('a collapsed heading shows a ⋯ that opens it when clicked', () => {
    make();
    expect(editor.view.dom.querySelector('[data-heading-fold-more]')).toBeNull();
    toggleHeadingFold(editor.view, headingPos('One'));
    const more = editor.view.dom.querySelector('[data-heading-fold-more]') as HTMLElement;
    expect(more.closest('h1')?.textContent).toContain('One');
    more.click();
    expect(collapsed()).toEqual([]);
  });

  it('is not an undo step', () => {
    make();
    toggleHeadingFold(editor.view, headingPos('One'));
    editor.commands.undo();
    expect(collapsed()).toEqual(['One']);
  });

  it('a heading with nothing under it cannot be collapsed', () => {
    make('<h1>Alone</h1>');
    toggleHeadingFold(editor.view, headingPos('Alone'));
    expect(collapsed()).toEqual([]);
  });

  it('moves the cursor out of what it hides', () => {
    make();
    cursorIn('b');
    toggleHeadingFold(editor.view, headingPos('One'));
    expect(collapsed()).toEqual(['One']);
    expect(editor.state.selection.$from.parent.textContent).toBe('One');
  });

  it('collapse all, levels, expand all', () => {
    make();
    setHeadingFoldLevel(editor.view, 1);
    expect(collapsed()).toEqual(['One', 'One.One', 'Two']);
    setHeadingFoldLevel(editor.view, 2);
    expect(collapsed()).toEqual(['One.One']);
    expect(hiddenTexts()).toEqual(['b']);
    setHeadingFoldLevel(editor.view, null);
    expect(collapsed()).toEqual([]);
  });

  it('round-trips through JSON and HTML', () => {
    make();
    toggleHeadingFold(editor.view, headingPos('One'));
    const json = editor.getJSON();
    const html = editor.getHTML();
    expect(html).toContain('data-collapsed="true"');
    make('');
    editor.commands.setContent(json);
    expect(collapsed()).toEqual(['One']);
    editor.commands.setContent(html);
    expect(collapsed()).toEqual(['One']);
  });
});

describe('hidden text stays reachable', () => {
  it('putting the cursor in hidden text opens the headings hiding it', () => {
    make();
    setHeadingFoldLevel(editor.view, 1);
    cursorIn('b');
    expect(collapsed()).toEqual(['Two']);
  });

  it('loading a note never opens its folds', () => {
    make();
    toggleHeadingFold(editor.view, headingPos('One'));
    const json = editor.getJSON();
    cursorIn('c');
    editor.commands.setContent(json);
    expect(collapsed()).toEqual(['One']);
  });

  it('the arrow keys step over a collapsed heading', () => {
    make();
    toggleHeadingFold(editor.view, headingPos('One'));
    cursorIn('One');
    editor.view.endOfTextblock = () => true;
    expect(press('ArrowDown')).toBe(true);
    expect(editor.state.selection.$from.parent.textContent).toBe('Two');
    expect(press('ArrowUp')).toBe(true);
    expect(editor.state.selection.$from.parent.textContent).toBe('One');
    expect(collapsed()).toEqual(['One']);
  });
});

describe('Ctrl+.', () => {
  it('toggles the heading the cursor is in, and leaves other text alone', () => {
    make();
    cursorIn('One');
    expect(toggleHeadingFoldAtCursor(editor.view)).toBe(true);
    expect(collapsed()).toEqual(['One']);
    cursorIn('c');
    expect(toggleHeadingFoldAtCursor(editor.view)).toBe(false);
  });

  it('splitting a collapsed heading keeps the fold with the half that has the text below', () => {
    make();
    toggleHeadingFold(editor.view, headingPos('One'));
    const pos = headingPos('One') + 2; // between "O" and "ne"
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
    editor.commands.splitBlock();
    expect(collapsed()).toEqual(['ne']);
  });
});
