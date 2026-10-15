// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { IdKeyExtensions, IDKEY_VARIANTS, addChoice, deleteStep, goToStep, gotoStep, setIdKeyVariant, stepPos } from './IdKey';
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
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...IdKeyExtensions],
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

// "Title | 1. question: choice>result, choice>result | 2. …", anything else as "type:text".
function outline(): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((section) => section.forEach((b) => {
    if (b.type.name !== 'idKey') { out.push(`${b.type.name}:${b.textContent}`); return; }
    const steps: string[] = [];
    b.forEach((s, _o, i) => {
      if (i === 0) return;
      const leads: string[] = [];
      s.forEach((l, _o2, j) => { if (j > 0) leads.push(`${l.child(0).textContent}>${l.child(1).textContent}`); });
      steps.push(`${i}. ${s.child(0).textContent}: ${leads.join(', ')}`);
    });
    out.push(`key(${b.attrs.variant}) ${b.child(0).textContent} | ${steps.join(' | ')}`);
  }));
  return out;
}
const keyPos = () => { let pos = -1; editor.state.doc.descendants((n, p) => { if (n.type.name === 'idKey') pos = p; }); return pos; };
const keyNode = () => editor.state.doc.nodeAt(keyPos())!;

// A two-step bird key, typed with Enter (title, question, choice, result, choice, result, then on).
function birdKey() {
  make();
  type('\\key ');
  type('Garden birds');
  press('Enter');
  type('Beak?');
  press('Enter');
  type('Hooked');
  press('Enter');
  type('Raptor');
  press('Enter');
  type('Straight');
  press('Enter');
  type('2');
  press('Enter');
  type('Webbed feet?');
  press('Enter');
  type('Yes');
  press('Enter');
  type('Duck');
  press('Enter');
  type('No');
  press('Enter');
  type('Sparrow');
}

describe('identification key block', () => {
  it('`\\key` + space inserts one step of two choices; Enter goes through every field and on to a new step', () => {
    birdKey();
    expect(outline()).toEqual(['key(couplets) Garden birds | 1. Beak?: Hooked>Raptor, Straight>2 | 2. Webbed feet?: Yes>Duck, No>Sparrow']);
  });

  it('Enter in an empty step leaves the key, taking that step with it', () => {
    birdKey();
    press('Enter');   // to a new step 3 (its question)
    press('Enter');   // to its first choice
    press('Enter');   // an empty step: leave
    type('After');
    expect(outline()).toEqual(['key(couplets) Garden birds | 1. Beak?: Hooked>Raptor, Straight>2 | 2. Webbed feet?: Yes>Duck, No>Sparrow', 'paragraph:After']);
  });

  it('a result that names a step goes to it (and is flagged when there is no such step)', () => {
    expect(gotoStep('2')).toBe(2);
    expect(gotoStep(' 12 ')).toBe(12);
    expect(gotoStep('Raptor')).toBeNull();
    birdKey();
    expect(editor.view.dom.querySelector('[data-ik-goto]')?.textContent).toMatch(/^2/);
    expect(editor.view.dom.querySelector('[data-ik-goto-btn]')).not.toBeNull();
    expect(editor.view.dom.querySelectorAll('[data-ik-answer]').length).toBe(3);
    // Point it at a step that doesn't exist.
    const goto = editor.view.dom.querySelector('[data-ik-goto]')!;
    const at = editor.view.posAtDOM(goto, 0);
    editor.view.dispatch(editor.state.tr.insertText('9', at, at + 1));
    expect(editor.view.dom.querySelector('[data-ik-bad]')?.textContent).toBe('9');
  });

  it('go to step puts the cursor in that step', () => {
    birdKey();
    goToStep(editor.view, keyPos(), 1);
    expect(editor.state.selection.$from.parent.textContent).toBe('Beak?');
  });

  it('Shift+Tab steps back through the fields; Backspace at a field start never merges', () => {
    birdKey();
    press('Tab', true);
    expect(editor.state.selection.$from.parent.textContent).toBe('No');
    const before = outline();
    const p = editor.state.selection.$from.start();
    editor.commands.setTextSelection(p);
    press('Backspace');
    expect(outline()).toEqual(before);
    expect(editor.state.selection.$from.parent.textContent).toBe('Duck');
  });

  it('adding a choice and removing a step; the last step can’t be removed', () => {
    birdKey();
    addChoice(editor.view, stepPos(keyNode(), keyPos(), 0));
    expect(keyNode().child(1).childCount - 1).toBe(3);
    expect(deleteStep(editor.view, stepPos(keyNode(), keyPos(), 1))).toBe(true);
    expect(deleteStep(editor.view, stepPos(keyNode(), keyPos(), 0))).toBe(false);
  });

  it('both designs round-trip through JSON and HTML; couplets draw their dotted leaders', () => {
    birdKey();
    expect(editor.view.dom.querySelectorAll('[data-ik-leader]').length).toBe(4);
    for (const v of IDKEY_VARIANTS) {
      setIdKeyVariant(editor.view, keyPos(), v);
      const before = outline();
      const html = editor.getHTML();
      expect(html).toContain(`data-variant="${v}"`);
      const json = editor.getJSON();
      editor.commands.setContent(html);
      expect(outline()).toEqual(before);
      editor.commands.setContent(json);
      expect(outline()).toEqual(before);
    }
    expect(editor.view.dom.querySelectorAll('[data-ik-leader]').length).toBe(0);
  });

  it('copies as a printed key', () => {
    birdKey();
    expect(noteClipboardText(editor.state.doc.slice(0, editor.state.doc.content.size))).toBe([
      'Key: Garden birds', '1. Beak?', '   1a. Hooked … Raptor', '   1b. Straight → 2', '2. Webbed feet?', '   2a. Yes … Duck', '   2b. No … Sparrow',
    ].join('\n'));
  });
});
