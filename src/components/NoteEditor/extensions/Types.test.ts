// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { TypesExtensions, TYPES_VARIANTS, addType, deleteType, itemPos, setTypeIcon, setTypesVariant } from './Types';
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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...TypesExtensions],
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

// "Category: name/trait/example; …", anything else as "type:text".
function outline(): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((section) => section.forEach((b) => {
    if (b.type.name !== 'types') { out.push(`${b.type.name}:${b.textContent}`); return; }
    const items: string[] = [];
    b.forEach((c, _o, i) => { if (i > 0) items.push([0, 1, 2].map((f) => c.child(f).textContent).join('/')); });
    out.push(`types(${b.attrs.variant}) ${b.child(0).textContent}: ${items.join('; ')}`);
  }));
  return out;
}
const typesPos = () => { let pos = -1; editor.state.doc.descendants((n, p) => { if (n.type.name === 'types') pos = p; }); return pos; };
const typesNode = () => editor.state.doc.nodeAt(typesPos())!;

describe('types block', () => {
  it('`\\types` + space inserts one with three empty types, the cursor in the category', () => {
    make();
    type('\\types ');
    expect(outline()).toEqual(['types(guide) : //; //; //']);
    expect(editor.state.selection.$from.parent.type.name).toBe('typesCategory');
  });

  it('Enter goes category → name → trait → example → the next type; an empty type leaves', () => {
    make();
    type('\\types ');
    type('Birds');
    press('Enter');
    type('Raptors');
    press('Enter');
    type('Hooked beak');
    press('Enter');
    type('Golden eagle');
    press('Enter');
    type('Waterfowl');
    press('Enter');
    press('Enter');
    press('Enter');
    // The third (empty) type: Enter there leaves the block, taking the empty type with it.
    press('Enter');
    type('After');
    expect(outline()).toEqual(['types(guide) Birds: Raptors/Hooked beak/Golden eagle; Waterfowl//', 'paragraph:After']);
  });

  it('Backspace at the start of a field steps back rather than merging; an empty type is removed', () => {
    make();
    type('\\types ');
    type('Birds');
    press('Enter');
    type('Raptors');
    press('Enter');
    press('Backspace');
    expect(editor.state.selection.$from.parent.textContent).toBe('Raptors');
    expect(outline()).toEqual(['types(guide) Birds: Raptors//; //; //']);
  });

  it('Tab / Shift+Tab move between types', () => {
    make();
    type('\\types ');
    press('Tab');
    type('One');
    press('Tab');
    type('Two');
    press('Tab', true);
    expect(editor.state.selection.$from.parent.textContent).toBe('One');
  });

  it('every design round-trips through JSON and HTML, with an icon kept', () => {
    make();
    type('\\types ');
    type('Birds');
    press('Enter');
    type('Raptors');
    setTypeIcon(editor.view, itemPos(typesNode(), typesPos(), 0), { icon: '🦅', image: null });
    for (const v of TYPES_VARIANTS) {
      setTypesVariant(editor.view, typesPos(), v);
      const html = editor.getHTML();
      expect(html).toContain(`data-variant="${v}"`);
      const json = editor.getJSON();
      editor.commands.setContent(html);
      expect(outline()).toEqual([`types(${v}) Birds: Raptors//; //; //`]);
      expect(typesNode().child(1).attrs.icon).toBe('🦅');
      editor.commands.setContent(json);
      expect(outline()).toEqual([`types(${v}) Birds: Raptors//; //; //`]);
    }
  });

  it('adding and removing types; the last one can’t be removed', () => {
    make();
    type('\\types ');
    addType(editor.view, typesPos());
    expect(typesNode().childCount - 1).toBe(4);
    for (let i = 0; i < 3; i++) deleteType(editor.view, itemPos(typesNode(), typesPos(), 0));
    expect(typesNode().childCount - 1).toBe(1);
    expect(deleteType(editor.view, itemPos(typesNode(), typesPos(), 0))).toBe(false);
  });

  it('draws an icon slot per type, and copies as a list', () => {
    make();
    type('\\types ');
    type('Birds');
    press('Enter');
    type('Raptors');
    press('Enter');
    type('Hooked beak');
    press('Enter');
    type('Eagle');
    expect(editor.view.dom.querySelectorAll('[data-ty-icon]').length).toBe(3);
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe('Birds, types:\n- Raptors — Hooked beak (e.g. Eagle)');
  });
});
