// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './extensions/Section';
import { NoteTagMark } from './extensions/NoteTagMark';
import { ConceptRefMark } from './extensions/ConceptRef';
import { NoteObjectTrigger } from './objects/NoteObjectTrigger';
import { resolveContextMenu } from '@/contextMenu/registry';
import type { ContextMenuContext, ContextMenuItem, ContextMenuSection } from '@/contextMenu/types';
import { useNoteStore } from '@/store/noteStore';
import { selectionActions } from './objects/selectionActions';
import './contextMenu';
import './extensions/headingMenu';
import './extensions/inboxMenu';
import './extensions/hubMenu';
import './extensions/noteLinkMenu';
import './extensions/unsureMenu';

// The note editor's right-click menu on selected text (tidied 2026-11-02): the selection's four
// families, then the clipboard, then formatting, each a section; everything the `\` selection menu
// offers is in the families.

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
beforeEach(() => useNoteStore.setState(useNoteStore.getInitialState(), true));
afterEach(() => editor?.destroy());

function make(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteTagMark, ConceptRefMark, NoteObjectTrigger],
    content,
  });
}

function menu(): ContextMenuSection[] {
  const ctx: ContextMenuContext = {
    section: 'notes', target: editor.view.dom.querySelector('p')!, x: 0, y: 0, selectionText: '',
    scopes: [{ kind: 'note-editor', data: { editor, paste: async () => {}, openLink: () => {}, openCreate: () => {}, insertTitle: () => {} } }],
  };
  return resolveContextMenu(ctx);
}
const ids = (s: ContextMenuSection) => s.map((i) => i.id);
const deep = (items: ContextMenuItem[]): string[] => items.flatMap((i) => [i.id, ...(i.submenu ? deep(i.submenu.flat()) : [])]);
const depth = (sections: ContextMenuSection[]): number => Math.max(0, ...sections.flat().map((i) => (i.submenu ? 1 + depth(i.submenu) : 0)));

describe('right-click on selected note text', () => {
  it('is four families, the clipboard, then formatting', () => {
    make('<h1>Head</h1><p>photosynthesis</p>');
    editor.commands.setTextSelection({ from: 8, to: 22 });
    const sections = menu();
    expect(sections.map(ids)).toEqual([
      ['mark-as', 'turn-into', 'link', 'send-selection'],
      ['cut', 'copy', 'paste', 'paste-plain', 'select-all'],
      ['style', 'headings'],
    ]);
    expect(depth(sections)).toBeLessThanOrEqual(2);
  });

  it('offers everything the selection menu offers, Add to dictionary included', () => {
    make('<p>photosynthesis</p>');
    editor.commands.setTextSelection({ from: 2, to: 16 });
    const offered = deep(menu().flat());
    const keys = selectionActions(editor as never, { from: 2, to: 16 }).map((a) => a.key);
    expect(keys).toContain('dictionary');
    expect(keys.filter((k) => !offered.includes(k))).toEqual([]);
  });

  it('a Glossary term the selected words name is offered as a link right under its kind\'s card', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Stats' });
    const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: 'concept', tagId: 'builtin-concept', term: 'Coefficient of determination', fields: {}, noteId, collectionId: null });
    make('<p>the coefficient of determination here</p>');
    const keys = selectionActions(editor as never, { from: 6, to: 34 }).map((a) => a.key);
    expect(keys.indexOf(`link-term-${id}`)).toBe(keys.indexOf('concept') + 1);
    // a plural, and the selection a whole-word part of a longer name, count too; an unrelated word doesn't
    make('<p>coefficients of determination, and bananas</p>');
    expect(selectionActions(editor as never, { from: 2, to: 31 }).some((a) => a.key === `link-term-${id}`)).toBe(true);
    expect(selectionActions(editor as never, { from: 37, to: 44 }).some((a) => a.key === `link-term-${id}`)).toBe(false);
  });

  it('every selection action has a key of its own (2026-11-03: Mark as ▸ Quote and Turn into ▸ Quote once shared one)', () => {
    make('<p>photosynthesis</p>');
    const keys = selectionActions(editor as never, { from: 2, to: 16 }).map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('with nothing selected: the clipboard, then a web link with the formatting', () => {
    make('<p>text</p>');
    editor.commands.setTextSelection(2);
    expect(menu().map(ids)).toEqual([['cut', 'copy', 'paste', 'paste-plain', 'select-all'], ['link', 'style']]);
  });
});
