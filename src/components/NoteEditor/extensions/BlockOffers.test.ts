// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { QuoteExtensions } from './Quote';
import { TypesExtensions } from './Types';
import { ProsConsExtensions } from './ProsCons';
import { BlockOffers } from './BlockOffers';
import { NoteObjectTrigger, objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { forgetPassedOffers } from './typingOffer';
import { prosConsJustTyped, quoteJustTyped, typesJustTyped } from '@/utils/blockOffers';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

describe('spotting blocks in what is typed (utils/blockOffers.ts)', () => {
  it('a line that is only a quotation, with who said it before it or not', () => {
    expect(quoteJustTyped('“The engine might compose music”')).toEqual({ quote: 'The engine might compose music', who: '' });
    expect(quoteJustTyped("Ada Lovelace once said 'the engine might compose music'")).toEqual({ quote: 'the engine might compose music', who: 'Ada Lovelace' });
    expect(quoteJustTyped('As Einstein put it, "imagination is more important than knowledge"')).toMatchObject({ who: 'Einstein' });
    expect(quoteJustTyped('Feynman: “What I cannot create, I do not understand”')).toMatchObject({ who: 'Feynman' });
    expect(quoteJustTyped('He said "hi there, old friend"')).toMatchObject({ who: 'He' });
    // Not a quotation: too short, or other writing around it.
    expect(quoteJustTyped('“Hello there”')).toBeNull();
    expect(quoteJustTyped('I think the word "photosynthesis is hard" is odd and then "more words here"')).toBeNull();
    expect(quoteJustTyped("it's the dog's bone")).toBeNull();
  });

  it('"there are N types of X", and the other ways of saying it', () => {
    expect(typesJustTyped('There are three types of rock:')).toMatchObject({ subject: 'Rock', count: 3, from: 0, to: 29 });
    expect(typesJustTyped('Geology. There are 4 main kinds of volcano.')).toMatchObject({ subject: 'Volcano', count: 4, from: 9 });
    expect(typesJustTyped('The two types of the cell are:')).toMatchObject({ subject: 'Cell', count: 2 });
    expect(typesJustTyped('Intro. Rocks can be divided into three categories:')).toMatchObject({ subject: 'Rocks', count: 3, from: 7 });
    expect(typesJustTyped('There are several varieties of apple:')).toMatchObject({ count: 3 });
    expect(typesJustTyped('There are 40 types of beetle:')).toMatchObject({ count: 8 });
    expect(typesJustTyped('There are three types of rock')).toBeNull();
    expect(typesJustTyped('There are three cats:')).toBeNull();
  });

  it('"the pros and cons of X", and the like', () => {
    expect(prosConsJustTyped('The pros and cons of renting:')).toMatchObject({ subject: 'Renting', from: 0, to: 28 });
    expect(prosConsJustTyped('Here are the advantages and disadvantages of nuclear power.')).toMatchObject({ subject: 'Nuclear power' });
    expect(prosConsJustTyped('The pros and cons of renting')).toBeNull();
  });
});

describe('block offers in the editor', () => {
  let editor: Editor;
  beforeEach(() => {
    forgetPassedOffers();
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteObjectTrigger, ...QuoteExtensions, ...TypesExtensions, ...ProsConsExtensions, BlockOffers],
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
  const blocks = (name: string) => { const out: string[] = []; editor.state.doc.descendants((n) => { if (n.type.name === name) out.push(n.textContent); }); return out; };

  it('a quotation typed as a line becomes a quote, who said it in its Who field', () => {
    type('Ada Lovelace once said “the engine might compose music”');
    expect(chip()).toContain('Make it a quote');
    expect(chip()).toContain('Ada Lovelace');
    expect(press('Enter')).toBe(true);
    const quote = editor.state.doc.firstChild!.firstChild!;
    expect(quote.type.name).toBe('quoteBlock');
    expect(quote.child(0).textContent).toBe('the engine might compose music');
    let who = '';
    quote.forEach((c) => { if (c.attrs.field === 'who') who = c.textContent; });
    expect(who).toBe('Ada Lovelace');
    expect(editor.state.selection.$from.parent.attrs.field).toBe('who');
  });

  it('"There are three types of rock:" offers a Types block after the line, the cursor in its first type', () => {
    type('There are three types of rock:');
    expect(chip()).toContain('Rock (3)');
    press('Tab');
    expect(editor.state.doc.textContent.startsWith('There are three types of rock:')).toBe(true);
    expect(blocks('types')).toEqual(['Rock']);
    let items = 0;
    editor.state.doc.descendants((n) => { if (n.type.name === 'typesItem') items++; });
    expect(items).toBe(3);
    expect(editor.state.selection.$from.parent.type.name).toBe('typesName');
  });

  it('"The pros and cons of renting:" offers Pros and cons, the cursor in the first pro', () => {
    type('The pros and cons of renting:');
    expect(chip()).toContain('Renting');
    press('Enter');
    expect(blocks('prosConsSubject')).toEqual(['Renting']);
    expect(editor.state.selection.$from.parent.type.name).toBe('prosConsPoint');
  });

  it('Esc passes an offer over: not offered again for the same thing in that note', () => {
    type('There are three types of rock:');
    press('Escape');
    expect(chip()).toBeNull();
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');
    type('There are three types of rock:');
    expect(chip()).toBeNull();
    expect(blocks('types')).toEqual([]);
  });

  it('nothing is offered inside a block', () => {
    editor.commands.setContent('<p></p>');
    type('“The engine might compose music”');
    press('Enter');
    expect(blocks('quoteBlock')).toHaveLength(1);
    // Typing a quotation into the quote's own text offers nothing.
    const at = editor.state.doc.firstChild!.firstChild!;
    expect(at.type.name).toBe('quoteBlock');
    editor.commands.setTextSelection(3);
    type(' and “some more words here”');
    expect(chip()).toBeNull();
  });
});
