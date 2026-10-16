// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { Node as PMNode } from '@tiptap/pm/model';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { ProsConsExtensions } from './ProsCons';
import { ARGUMENT_VARIANTS, ArgumentExtensions, fieldsOf, setArgumentSides, setArgumentVariant, toggleArgumentField } from './Argument';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { argumentBlock } from '../objects/argumentBlock';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;
Element.prototype.scrollIntoView = () => {};

describe('the argument block', () => {
  let editor: Editor;
  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...ProsConsExtensions, ...ArgumentExtensions],
      content: '<p></p>',
    });
    objectTriggerStorage(editor).getContext = () => ({ noteId: 'n1', collectionId: null, now: new Date() });
    editor.commands.focus('end');
  });
  afterEach(() => editor.destroy());

  function type(text: string) {
    for (const ch of text) {
      const { from, to } = editor.state.selection;
      editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
    }
  }
  const press = (key: string, shiftKey = false) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))) ?? false;
  const arg = (): { node: PMNode; pos: number } => {
    let found: { node: PMNode; pos: number } | null = null;
    editor.state.doc.descendants((n, pos) => { if (!found && n.type.name === 'argument') found = { node: n, pos }; return !found; });
    return found!;
  };
  const lists = () => { const out: Record<string, string[]> = {}; arg().node.forEach((c) => { if (c.type.name === 'prosConsList') { const pts: string[] = []; c.forEach((p) => pts.push(p.textContent)); out[c.attrs.side] = pts; } }); return out; };
  const insert = () => {
    type('\\argument');
    const end = editor.state.selection.from;
    argumentBlock.insert(editor.view, end - '\\argument'.length, end, null);
  };

  it('\\argument puts in a claim with evidence for and against, the cursor in the claim', () => {
    insert();
    expect(arg().node.child(0).type.name).toBe('argumentClaim');
    expect(lists()).toEqual({ pro: [''], con: [''] });
    expect(editor.state.selection.$from.parent.type.name).toBe('argumentClaim');
  });

  it('Enter moves claim → evidence for, adds pieces, then on to evidence against, then out', () => {
    insert();
    type('Cities should ban cars');
    press('Enter');
    type('Less pollution');
    press('Enter');
    type('Safer streets');
    press('Enter');
    press('Enter');
    type('Deliveries suffer');
    press('Enter');
    press('Enter');
    expect(lists()).toEqual({ pro: ['Less pollution', 'Safer streets'], con: ['Deliveries suffer'] });
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('For only / Against only hide a side and keep what it held; showing it again brings it back', () => {
    insert();
    type('Claim');
    press('Enter');
    type('A reason');
    const { pos } = arg();
    setArgumentSides(editor.view, pos, 'against');
    expect(Object.keys(lists())).toEqual(['con']);
    expect(arg().node.attrs.sides).toBe('against');
    setArgumentSides(editor.view, arg().pos, 'both');
    expect(lists()).toEqual({ pro: ['A reason'], con: [''] });
    setArgumentSides(editor.view, arg().pos, 'for');
    expect(Object.keys(lists())).toEqual(['pro']);
  });

  it('parts show (the cursor in it) and hide, their text kept, always in the same order', () => {
    insert();
    toggleArgumentField(editor.view, arg().pos, 'sources');
    expect(editor.state.selection.$from.parent.attrs.field).toBe('sources');
    type('Smith 2020');
    toggleArgumentField(editor.view, arg().pos, 'by');
    expect(fieldsOf(arg().node)).toEqual(['by', 'sources']);
    toggleArgumentField(editor.view, arg().pos, 'sources');
    expect(fieldsOf(arg().node)).toEqual(['by']);
    toggleArgumentField(editor.view, arg().pos, 'sources');
    let sources = '';
    arg().node.forEach((c) => { if (c.attrs.field === 'sources') sources = c.textContent; });
    expect(sources).toBe('Smith 2020');
  });

  it('every design keeps the content, and it round-trips through HTML', () => {
    insert();
    type('Claim');
    press('Enter');
    type('Evidence');
    press('Enter');
    press('Enter');
    type('Counter');
    setArgumentSides(editor.view, arg().pos, 'for');
    const before = arg().node.textContent;
    for (const v of ARGUMENT_VARIANTS) {
      setArgumentVariant(editor.view, arg().pos, v);
      expect(arg().node.attrs.variant).toBe(v);
      expect(arg().node.textContent).toBe(before);
    }
    const html = editor.getHTML();
    editor.commands.setContent(html);
    expect(arg().node.attrs).toMatchObject({ variant: ARGUMENT_VARIANTS[ARGUMENT_VARIANTS.length - 1], sides: 'for' });
    expect(arg().node.attrs.hidden).toHaveProperty('against');
    expect(lists()).toEqual({ pro: ['Evidence'] });
  });

  it('Backspace in an empty claim turns an empty argument back into a line', () => {
    insert();
    press('Backspace');
    let found = false;
    editor.state.doc.descendants((n) => { if (n.type.name === 'argument') found = true; });
    expect(found).toBe(false);
  });
});
