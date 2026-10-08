// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { Node as PMNode } from '@tiptap/pm/model';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { TimelineExtensions } from './Timeline';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { getSession } from '../objects/session';
import { chosenKind, interpretQuery, matchPickable } from '../objects/kinds';
import { NOTE_BLOCK_KINDS } from '../objects/blockKinds';
import { NOTE_OBJECT_KINDS } from '../objects/kinds';

// jsdom has no layout; ProseMirror's scroll-into-view asks for rects.
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content = '<p></p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...TimelineExtensions],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId: 'note-1', collectionId: null, now: new Date(2026, 9, 6, 9) });
  editor.commands.focus('end');
}

// Typing as the browser does: handleTextInput first, else the plain insert.
function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

// A key as the editor sees it; unhandled Enter/Backspace fall back to the editor's own commands,
// the way the browser's default would.
function press(key: 'Enter' | 'Backspace' | 'Delete') {
  const view = editor.view;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  const handled = view.someProp('handleKeyDown', (f) => f(view, event)) ?? false;
  if (!handled) {
    if (key === 'Enter') editor.commands.splitBlock();
    if (key === 'Backspace') editor.commands.joinBackward();
  }
}

// The document as "type:text" lines; a timeline as its entries "When | body".
function outline(): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((section) => section.forEach((block: PMNode) => {
    if (block.type.name !== 'timeline') { out.push(`${block.type.name}:${block.textContent}`); return; }
    const entries: string[] = [];
    block.forEach((item) => {
      const body: string[] = [];
      item.forEach((child, _o, i) => { if (i > 0) body.push(child.textContent); });
      entries.push(`${item.child(0).textContent} | ${body.join(' / ')}`);
    });
    out.push(`timeline[${entries.join(' ; ')}]`);
  }));
  return out;
}
const cursorIn = () => editor.state.selection.$from.parent.type.name;

describe('`\\` offers note blocks', () => {
  it('lists objects then blocks, and a block keyword chooses it', () => {
    expect(matchPickable('').map((k) => k.id)).toEqual([...NOTE_OBJECT_KINDS, ...NOTE_BLOCK_KINDS].map((k) => k.id));
    expect(matchPickable('ti').map((k) => k.id)).toEqual(['timeline']);
    expect(chosenKind('tl')?.id).toBe('timeline');
    expect(chosenKind('rem')?.id).toBe('reminder');
    // A block keyword and a space is never a composing object.
    expect(interpretQuery('timeline ')).toBeNull();
  });

  it('`\\timeline` + space inserts a timeline in place of the empty line, cursor in its When', () => {
    make();
    type('\\timeline ');
    expect(outline()).toEqual(['timeline[ | ]']);
    expect(cursorIn()).toBe('timelineWhen');
    expect(getSession(editor.state)).toBeNull();
  });

  it('`\\tl` + Enter inserts it too; after text on the line, the timeline goes below the line', () => {
    make('<p>History</p>');
    type(' \\tl');
    press('Enter');
    expect(outline()).toEqual(['paragraph:History', 'timeline[ | ]']);
    expect(cursorIn()).toBe('timelineWhen');
  });
});

describe('writing a timeline', () => {
  it('When → Enter → body; an empty line → next entry; an empty entry → out', () => {
    make();
    type('\\tl ');
    type('1914');
    press('Enter');
    expect(cursorIn()).toBe('paragraph');
    type('War begins');
    press('Enter');
    type('Second line');
    press('Enter');
    press('Enter');                  // empty last line: the next entry
    expect(cursorIn()).toBe('timelineWhen');
    type('1918');
    press('Enter');
    type('Armistice');
    press('Enter');
    press('Enter');
    press('Enter');                  // an empty entry's When: leave the timeline
    expect(cursorIn()).toBe('paragraph');
    type('After');
    expect(outline()).toEqual(['timeline[1914 | War begins / Second line ; 1918 | Armistice]', 'paragraph:After']);
  });

  it('Backspace at the start of a body goes back to the When without merging', () => {
    make();
    type('\\tl 1914');
    press('Enter');
    type('War');
    editor.commands.setTextSelection(editor.state.selection.from - 3);   // start of "War"
    press('Backspace');
    expect(cursorIn()).toBe('timelineWhen');
    expect(editor.state.selection.$from.parentOffset).toBe(4);
    expect(outline()).toEqual(['timeline[1914 | War]']);
  });

  it('Backspace in an empty entry removes it; in the only empty entry, removes the timeline', () => {
    make();
    type('\\tl 1914');
    press('Enter');
    type('War');
    press('Enter');
    press('Enter');                  // new empty entry
    press('Backspace');
    expect(outline()).toEqual(['timeline[1914 | War]']);
    expect(editor.state.selection.$from.parent.textContent).toBe('War');

    editor.destroy();
    make();
    type('\\tl ');
    press('Backspace');
    expect(outline()).toEqual(['paragraph:']);
  });

  it('Delete at the end of a When does nothing (never merges the body up)', () => {
    make();
    type('\\tl 1914');
    press('Enter');
    type('War');
    editor.commands.setTextSelection(editor.state.selection.from - 5);   // end of "1914"
    expect(cursorIn()).toBe('timelineWhen');
    press('Delete');
    expect(outline()).toEqual(['timeline[1914 | War]']);
  });

  it('survives saving and loading (JSON and HTML)', () => {
    make();
    type('\\tl 1914');
    press('Enter');
    type('War');
    const json = editor.getJSON();
    const html = editor.getHTML();
    expect(html).toContain('data-type="timeline"');
    expect(html).toContain('data-variant="rail"');
    editor.commands.setContent(json);
    expect(outline()).toEqual(['timeline[1914 | War]']);
    editor.commands.setContent(html);
    expect(outline()).toEqual(['timeline[1914 | War]']);
  });

  it('draws a placeholder in an empty When and an Add entry button that adds one', () => {
    make();
    type('\\tl ');
    const dom = editor.view.dom;
    expect(dom.querySelector('[data-timeline-when][data-tl-empty]')).not.toBeNull();
    const add = dom.querySelector('[data-timeline-add]') as HTMLButtonElement;
    expect(add).not.toBeNull();
    add.click();
    expect(outline()).toEqual(['timeline[ |  ;  | ]']);
    expect(cursorIn()).toBe('timelineWhen');
  });
});

describe('sorting by date', () => {
  // Writes entries as a person would: When, Enter, text, Enter twice for the next one.
  function writeEntries(entries: [string, string][]) {
    type('\\tl ');
    entries.forEach(([when, text], i) => {
      type(when);
      press('Enter');
      type(text);
      if (i < entries.length - 1) { press('Enter'); press('Enter'); }
    });
  }
  const leave = () => { press('Enter'); press('Enter'); press('Enter'); };   // new entry, then out

  it('sorts an entry into place when the cursor leaves it, and flashes it there', () => {
    make();
    writeEntries([['1918', 'Armistice'], ['28 June 1914', 'Sarajevo']]);
    press('Enter');
    press('Enter');                  // leaves "28 June 1914" for a new entry
    // The new entry stays where it was made, at the end; the others sort around it.
    expect(outline()).toEqual(['timeline[28 June 1914 | Sarajevo ; 1918 | Armistice ;  | ]']);
    expect(cursorIn()).toBe('timelineWhen');
    expect(editor.view.dom.querySelector('[data-tl-moved]')?.textContent).toContain('Sarajevo');
    // …and Enter on it leaves the timeline, as on any empty entry.
    press('Enter');
    type('After');
    expect(outline()).toEqual(['timeline[28 June 1914 | Sarajevo ; 1918 | Armistice]', 'paragraph:After']);
  });

  it('an empty entry in the middle leaves the timeline too', () => {
    make();
    writeEntries([['1914', 'War'], ['1918', 'Armistice']]);
    editor.commands.setTextSelection(4);                    // in "1914"
    press('Enter');                                         // to its text
    editor.commands.setTextSelection(editor.state.selection.from + 3);   // end of "War"
    press('Enter');
    press('Enter');                                         // a new entry between the two
    expect(outline()[0]).toBe('timeline[1914 | War ;  |  ; 1918 | Armistice]');
    press('Enter');
    expect(outline()).toEqual(['timeline[1914 | War ; 1918 | Armistice]', 'paragraph:']);
  });

  it('never sorts while typing in an entry, and not at all "as typed"', () => {
    make();
    writeEntries([['1918', 'Armistice'], ['1914', 'War']]);
    expect(outline()).toEqual(['timeline[1918 | Armistice ; 1914 | War]']);   // still in "1914"
    editor.commands.command(({ tr }) => { tr.setNodeAttribute(editor.state.selection.$from.before(2), 'order', 'manual'); return true; });
    leave();
    expect(outline()[0]).toBe('timeline[1918 | Armistice ; 1914 | War]');
  });

  it('newest first, set from the order button, sorts at once', () => {
    make();
    writeEntries([['1914', 'War'], ['1918', 'Armistice']]);
    leave();
    const button = () => editor.view.dom.querySelector('[data-tl-tool="order"]') as HTMLButtonElement;
    expect(button().textContent).toBe('Oldest first');
    button().click();
    expect(outline()[0]).toBe('timeline[1918 | Armistice ; 1914 | War]');
    expect(button().textContent).toBe('Newest first');
    button().click();
    expect(button().textContent).toBe('As typed');
  });

  it('shows the year a When takes from the entry before it', () => {
    make();
    writeEntries([['28 June 1914', 'Sarajevo'], ['23 July', 'Ultimatum']]);
    const chips = [...editor.view.dom.querySelectorAll('[data-tl-inferred]')].map((c) => c.textContent);
    expect(chips).toEqual(['1914']);
    expect(outline()[0]).toBe('timeline[28 June 1914 | Sarajevo ; 23 July | Ultimatum]');   // the chip isn't text
  });
});

describe('horizontal style', () => {
  it('the style button switches it; entries alternate above and below, one column apart', () => {
    make();
    type('\\tl 1914');
    press('Enter');
    type('War');
    press('Enter');
    press('Enter');
    type('1918');
    const horizontal = editor.view.dom.querySelectorAll('[data-block-design]')[1] as HTMLButtonElement;
    horizontal.click();
    const timeline = editor.view.dom.querySelector('[data-type="timeline"]') as HTMLElement;
    expect(timeline.getAttribute('data-variant')).toBe('horizontal');
    expect(timeline.style.getPropertyValue('--tl-end')).toBe('4');
    const items = [...timeline.querySelectorAll('[data-type="timeline-item"]')] as HTMLElement[];
    expect(items.map((i) => i.getAttribute('data-tl-side'))).toEqual(['above', 'below']);
    expect(items.map((i) => i.style.getPropertyValue('--tl-col'))).toEqual(['1', '2']);
    const saved = editor.getJSON().content?.[0].content?.[0] as { attrs?: Record<string, unknown> } | undefined;
    expect(saved?.attrs).toMatchObject({ variant: 'horizontal', order: 'asc' });
  });
});
