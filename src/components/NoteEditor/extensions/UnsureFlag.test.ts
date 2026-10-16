// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { QuestionExtensions } from './Question';
import { UnsureFlagExtensions, collectFlags, flagRange, flagToQuestion, resolveFlag, setFlagReason } from './UnsureFlag';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { unsureTrigger } from '../objects/unsureTrigger';
import { forgetPassedOffers } from './typingOffer';
import { marginItems } from './MarginColumn';
import { asQuestion, findUnsureTrigger, sentenceEndingAt } from '@/utils/unsureFlag';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;
Element.prototype.scrollIntoView = () => {};

describe('which sentence is flagged (utils/unsureFlag.ts)', () => {
  const sentence = (text: string) => { const s = sentenceEndingAt(text, text.length); return s && text.slice(s.from, s.to); };
  it('the sentence before, back to the one before it; its own full stop kept', () => {
    expect(sentence('Rome fell. It ended in 1920')).toBe('It ended in 1920');
    expect(sentence('Rome fell. It ended in 1920. ')).toBe('It ended in 1920.');
    expect(sentence('Only one sentence here')).toBe('Only one sentence here');
    expect(sentence('A value of 3.5 kg was used')).toBe('A value of 3.5 kg was used');
    expect(sentence('Done. ')).toBe('Done.');
    expect(sentence('   ')).toBeNull();
  });
  it('(?) just typed: the sentence, and the (?) with the spaces before it', () => {
    const before = 'Rome fell. It ended in 1920 (?)';
    const t = findUnsureTrigger(before)!;
    expect(before.slice(t.sentence.from, t.sentence.to)).toBe('It ended in 1920');
    expect(before.slice(t.trigger.from, t.trigger.to)).toBe(' (?)');
    expect(findUnsureTrigger('(?)')).toBeNull();
    expect(findUnsureTrigger('It ended (')).toBeNull();
  });
  it('a passage worded as a question', () => {
    expect(asQuestion('It ended in 1920.')).toBe('It ended in 1920?');
    expect(asQuestion('Is it true?')).toBe('Is it true?');
  });
});

describe('the Unsure flag in the editor', () => {
  let editor: Editor;
  beforeEach(() => {
    forgetPassedOffers();
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...QuestionExtensions, ...UnsureFlagExtensions],
      content: '<p></p>',
    });
    objectTriggerStorage(editor).getContext = () => ({ noteId: 'n1', collectionId: null, now: new Date() });
    editor.commands.focus('end');
  });
  afterEach(() => editor.destroy());

  function type(text: string) {
    for (const ch of text) {
      const view = editor.view;
      const { from, to } = view.state.selection;
      const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
      if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  }
  const press = (key: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))) ?? false;
  const chip = () => editor.view.dom.querySelector('[data-autolink-chip]')?.textContent ?? null;
  const flagged = () => collectFlags(editor.state.doc).map((f) => editor.state.doc.textBetween(f.from, f.to));
  const markers = () => editor.view.dom.querySelectorAll('[data-unsure-marker]');

  it('(?) after a sentence offers to flag it; accepting takes the (?) away and flags the sentence, one icon after it', () => {
    type('Rome fell. It ended in 1920 (?)');
    expect(chip()).toContain('Flag this sentence as unsure');
    expect(press('Enter')).toBe(true);
    expect(editor.state.doc.textContent).toBe('Rome fell. It ended in 1920');
    expect(flagged()).toEqual(['It ended in 1920']);
    expect(markers()).toHaveLength(1);
    // And in the margin column, its icon staying in the text too.
    const items = marginItems(editor.state).filter((i) => i.key.startsWith('unsure-'));
    expect(items.map((i) => editor.state.doc.textBetween(i.from, i.to))).toEqual(['It ended in 1920']);
  });

  it('passing the offer over leaves the (?) as it was', () => {
    type('It ended in 1920 (?)');
    press('Escape');
    expect(editor.state.doc.textContent).toBe('It ended in 1920 (?)');
    expect(flagged()).toEqual([]);
  });

  it('\\unsure flags the sentence before it; on a selection, exactly the selected text', () => {
    type('Rome fell. It ended in 1920 \\unsure');
    const end = editor.state.selection.from;
    unsureTrigger.insert(editor.view, end - '\\unsure'.length, end, null);
    expect(editor.state.doc.textContent).toBe('Rome fell. It ended in 1920 ');
    expect(flagged()).toEqual(['It ended in 1920']);
    editor.view.dispatch(flagRange(editor.state.tr, 2, 6)!);
    expect(flagged()).toContain('Rome');
  });

  it('turn into a question: a question block after the paragraph, the flag pointing at it; Resolved takes the flag off', () => {
    type('It ended in 1920.');
    const tr = flagRange(editor.state.tr, 2, 2 + 'It ended in 1920.'.length)!;
    editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 2)));
    const id = collectFlags(editor.state.doc)[0].flagId;
    setFlagReason(editor.view, id, 'no source');
    expect(collectFlags(editor.state.doc)[0].reason).toBe('no source');
    flagToQuestion(editor.view, id);
    const qs: { text: string; why: string; qid: string }[] = [];
    editor.state.doc.descendants((n) => {
      if (n.type.name !== 'questionBlock') return true;
      let why = '';
      n.forEach((c) => { if (c.attrs.field === 'why') why = c.textContent; });
      qs.push({ text: n.child(0).textContent, why, qid: n.attrs.qid });
      return false;
    });
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ text: 'It ended in 1920?', why: 'no source' });
    expect(collectFlags(editor.state.doc)[0].qid).toBe(qs[0].qid);
    expect(editor.state.selection.$from.parent.type.name).toBe('questionText');
    expect(editor.view.dom.querySelector('[data-unsure-marker]')?.getAttribute('data-unsure-marker')).toBe('question');
    resolveFlag(editor.view, id);
    expect(flagged()).toEqual([]);
    expect(editor.state.doc.textContent).toContain('It ended in 1920.');
  });

  it('round-trips through HTML', () => {
    type('Maybe so');
    editor.view.dispatch(flagRange(editor.state.tr, 2, 10, 'why')!);
    const html = editor.getHTML();
    expect(html).toContain('data-unsure-flag');
    editor.commands.setContent(html);
    expect(collectFlags(editor.state.doc)[0]).toMatchObject({ reason: 'why' });
  });
});
