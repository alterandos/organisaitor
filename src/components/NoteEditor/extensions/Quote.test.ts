// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { QuoteExtensions, initials, quoteFromSelection, setQuoteVariant, toggleQuoteField } from './Quote';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { noteClipboardText } from '../noteClipboardText';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content = '<p></p>') {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...QuoteExtensions],
    content,
  });
  objectTriggerStorage(editor).getContext = () => ({ noteId: 'n', collectionId: null, now: new Date() });
  editor.commands.focus('end');
}

function type(text: string) {
  for (const ch of text) {
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
function press(key: string, shiftKey = false) {
  const view = editor.view;
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  return view.someProp('handleKeyDown', (f) => f(view, event)) ?? false;
}

// The quote as "text | field=value | …", and anything else as "type:text".
function outline(): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((section) => section.forEach((b) => {
    if (b.type.name !== 'quoteBlock') { out.push(`${b.type.name}:${b.textContent}`); return; }
    const parts: string[] = [];
    b.forEach((c, _o, i) => parts.push(i === 0 ? c.textContent : `${c.attrs.field}=${c.textContent}`));
    out.push(`quote(${b.attrs.variant})[${parts.join(' | ')}]`);
  }));
  return out;
}
const at = () => {
  const p = editor.state.selection.$from.parent;
  return p.type.name === 'quoteField' ? p.attrs.field : p.type.name;
};
const quotePos = () => { let pos = -1; editor.state.doc.descendants((n, p) => { if (n.type.name === 'quoteBlock') pos = p; }); return pos; };

describe('quote block', () => {
  it('`\\quote` + space inserts one; Enter moves text → who → source → when → out', () => {
    make();
    type('\\quote ');
    expect(at()).toBe('quoteText');
    type('Imagination is more important than knowledge.');
    press('Enter');
    expect(at()).toBe('who');
    type('Albert Einstein');
    press('Enter');
    type('Saturday Evening Post');
    press('Enter');
    type('1929');
    press('Enter');
    expect(at()).toBe('paragraph');
    expect(outline()).toEqual([
      'quote(classic)[Imagination is more important than knowledge. | who=Albert Einstein | source=Saturday Evening Post | when=1929]',
      'paragraph:',
    ]);
  });

  it('Tab and Shift+Tab move between the parts; Backspace at a part’s start steps back, never merging', () => {
    make();
    type('\\q ');
    type('Words');
    press('Tab');
    expect(at()).toBe('who');
    press('Tab');
    expect(at()).toBe('source');
    press('Tab', true);
    expect(at()).toBe('who');
    press('Backspace');
    expect(at()).toBe('quoteText');
    expect(outline()[0]).toBe('quote(classic)[Words | who= | source= | when=]');
  });

  it('hiding a field keeps what it said; showing it brings it back, in its place', () => {
    make();
    type('\\q Words');
    press('Enter');
    type('Ada');
    const pos = quotePos();
    toggleQuoteField(editor.view, pos, 'who');
    expect(outline()[0]).toBe('quote(classic)[Words | source= | when=]');
    toggleQuoteField(editor.view, pos, 'where');
    toggleQuoteField(editor.view, pos, 'who');
    expect(outline()[0]).toBe('quote(classic)[Words | who=Ada | source= | when= | where=]');
  });

  it('empty fields show only while the quote is being edited; the first one shown leads with a dash', () => {
    make('<div data-type="quote"><div data-qb-text>Words</div><div data-qb-field="who"></div><div data-qb-field="source">The Book</div></div><p>after</p>');
    editor.commands.focus('end');                    // in "after": not editing the quote
    const field = (f: string) => editor.view.dom.querySelector(`[data-qb-field="${f}"]`)!;
    expect(field('who').hasAttribute('data-qb-hide')).toBe(true);
    expect(field('source').hasAttribute('data-qb-lead')).toBe(true);
    editor.commands.setTextSelection(3);             // in the quote's text
    expect(field('who').hasAttribute('data-qb-lead')).toBe(true);
    expect(field('source').hasAttribute('data-qb-sep')).toBe(true);
  });

  it('style, round trip, and Quote from selected text', () => {
    make('<p>To be or not to be</p>');
    quoteFromSelection(editor.view, 1 + 1, 1 + 1 + 'To be or not to be'.length);
    expect(at()).toBe('who');
    setQuoteVariant(editor.view, quotePos(), 'pull');
    type('Hamlet');
    const json = editor.getJSON();
    const html = editor.getHTML();
    expect(html).toContain('data-variant="pull"');
    editor.commands.setContent(json);
    expect(outline()[0]).toBe('quote(pull)[To be or not to be | who=Hamlet | source= | when=]');
    editor.commands.setContent(html);
    expect(outline()[0]).toBe('quote(pull)[To be or not to be | who=Hamlet | source= | when=]');
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('> “To be or not to be”\n> — Hamlet');
  });

  it('initials for the card style', () => {
    expect(initials('Albert Einstein')).toBe('AE');
    expect(initials('Ada Augusta King Lovelace')).toBe('AL');
    expect(initials('Plato')).toBe('P');
    expect(initials('  ')).toBe('');
  });
});
