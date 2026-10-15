// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { ConclusionExtensions, CONCLUSION_VARIANTS, addReason, conclusionFromSelection, funnelBand, setConclusionVariant } from './Conclusion';
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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...ConclusionExtensions],
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
function press(key: string) {
  const view = editor.view;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  return view.someProp('handleKeyDown', (f) => f(view, event)) ?? false;
}

// Each block as "type:text", a conclusion as "conclusion(variant):text".
function outline(): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((section) => section.forEach((b) => {
    if (b.type.name !== 'conclusion') { out.push(`${b.type.name}:${b.textContent}`); return; }
    const parts: string[] = [];
    b.forEach((c) => parts.push(c.type.name === 'conclusionReason' ? `because ${c.textContent}` : c.textContent));
    out.push(`conclusion(${b.attrs.variant}):${parts.join(' | ')}`);
  }));
  return out;
}
const conclusionPos = () => { let pos = -1; editor.state.doc.descendants((n, p) => { if (n.type.name === 'conclusion') pos = p; }); return pos; };

describe('conclusion block', () => {
  it('`\\conclusion` + space inserts one under what came before; Enter leaves it', () => {
    make('<p>It rained all week.</p><p></p>');
    type('\\conclusion ');
    expect(outline()).toEqual(['paragraph:It rained all week.', 'conclusion(arrow):']);
    type('The river will flood.');
    press('Enter');
    type('Next');
    expect(outline()).toEqual(['paragraph:It rained all week.', 'conclusion(arrow):The river will flood.', 'paragraph:Next']);
  });

  it('its keywords insert it too (\\therefore, \\thus)', () => {
    make();
    type('\\therefore ');
    expect(outline()).toEqual(['conclusion(arrow):']);
  });

  it('Enter on an empty one, or Backspace at its start, turns it back into a paragraph', () => {
    make();
    type('\\conclusion ');
    press('Enter');
    expect(outline()).toEqual(['paragraph:']);
    // A conclusion with text: Backspace at its start keeps the words as a plain paragraph.
    make();
    type('\\conclusion ');
    type('So it goes');
    const pos = conclusionPos();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + 2)));
    press('Backspace');
    expect(outline()).toEqual(['paragraph:So it goes']);
  });

  it('every design round-trips through JSON and HTML, and the text survives switching', () => {
    make();
    type('\\conclusion ');
    type('Therefore x');
    for (const v of CONCLUSION_VARIANTS) {
      setConclusionVariant(editor.view, conclusionPos(), v);
      const json = editor.getJSON();
      const html = editor.getHTML();
      expect(html).toContain(`data-variant="${v}"`);
      editor.commands.setContent(html);
      expect(outline()).toEqual([`conclusion(${v}):Therefore x`]);
      editor.commands.setContent(json);
      expect(outline()).toEqual([`conclusion(${v}):Therefore x`]);
    }
  });

  it('the brace design draws its brace; the others do not', () => {
    make();
    type('\\conclusion ');
    expect(editor.view.dom.querySelector('[data-cc-brace]')).toBeNull();
    setConclusionVariant(editor.view, conclusionPos(), 'brace');
    expect(editor.view.dom.querySelector('[data-cc-brace]')).not.toBeNull();
    expect(editor.view.dom.querySelector('[data-conclusion-tools] [data-block-designs]')).not.toBeNull();
  });

  it('Conclusion on selected text: the selection becomes the conclusion, its formatting kept', () => {
    make('<p>Evidence.</p><p>So <strong>it</strong> follows.</p>');
    let from = -1; let to = -1;
    editor.state.doc.descendants((n, p) => { if (n.isTextblock && n.textContent.startsWith('So')) { from = p + 1; to = p + 1 + n.content.size; } });
    conclusionFromSelection(editor.view, from, to);
    expect(outline()).toContain('conclusion(arrow):So it follows.');
    expect(editor.getHTML()).toMatch(/data-cc-text[^>]*>So <strong>it<\/strong> follows\./);
  });

  it('reasons: added from the pill, Enter starts the next, Enter on an empty one goes to the conclusion', () => {
    make();
    type('\\conclusion ');
    type('The river floods');
    addReason(editor.view, conclusionPos());
    type('It rained all week');
    press('Enter');
    type('The ground is full');
    press('Enter');
    press('Enter');
    expect(outline()).toEqual(['conclusion(arrow):because It rained all week | because The ground is full | The river floods']);
    expect(editor.state.selection.$from.parent.type.name).toBe('conclusionText');
    // Backspace at the start of the conclusion steps back into the last reason, never merging.
    const pos = conclusionPos();
    const node = editor.state.doc.nodeAt(pos)!;
    const textStart = pos + 1 + node.child(0).nodeSize + node.child(1).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, textStart + 1)));
    press('Backspace');
    expect(editor.state.selection.$from.parent.textContent).toBe('The ground is full');
    expect(outline()).toEqual(['conclusion(arrow):because It rained all week | because The ground is full | The river floods']);
  });

  it('several selected lines: the earlier ones become reasons, the last the conclusion', () => {
    make('<p>It rained all week.</p><p>The ground is full.</p><p>The river will flood.</p>');
    conclusionFromSelection(editor.view, 2, editor.state.doc.content.size - 2);   // from inside the first line's text to the end of the last's
    expect(outline()).toEqual(['conclusion(arrow):because It rained all week. | because The ground is full. | The river will flood.']);
  });

  it('the funnel narrows band by band to the spout', () => {
    expect(funnelBand(0, 2)).toEqual({ top: 1, bottom: 0.71 });
    expect(funnelBand(1, 2)).toEqual({ top: 0.71, bottom: 0.42 });
  });

  it('copies reasons with ∵ and the conclusion with ∴', () => {
    make();
    type('\\conclusion ');
    type('So');
    addReason(editor.view, conclusionPos());
    type('Because');
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('∵ Because\n∴ So');
  });

  it('copies as "∴ text"', () => {
    make();
    type('\\conclusion ');
    type('It follows');
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('∴ It follows');
  });
});
