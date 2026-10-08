// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from '../extensions/Section';
import { NoteTagMark } from '../extensions/NoteTagMark';
import { ConceptRefMark, collectRefGroups } from '../extensions/ConceptRef';
import { Importance, collectImportantPassages } from '../extensions/Importance';
import { NoteObjectTrigger } from './NoteObjectTrigger';
import { SelectionMenu } from './SelectionMenu';
import { getSelectionMenu } from './selectionMenuState';
import { useNoteStore } from '@/store/noteStore';
import type { NoteId } from '@/types';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
beforeEach(() => useNoteStore.setState(useNoteStore.getInitialState(), true));
afterEach(() => { cleanup(); editor?.destroy(); });

function setup() {
  const notes = useNoteStore.getState();
  const noteId = notes.addNote({ title: 'Biology' }) as NoteId;
  const entryId = notes.addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term: 'Photosynthesis', fields: { meaning: 'How plants make sugar' }, noteId, collectionId: null });
  const host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, NoteTagMark, ConceptRefMark, Importance, NoteObjectTrigger],
    content: '<p>Plants use photosynthesis to make sugar.</p>',
  });
  editor.view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
  const onMarkAs = vi.fn();
  render(<SelectionMenu editor={editor as never} onMarkAs={onMarkAs} />);
  // Select "photosynthesis" and type `\` over it.
  const text = editor.state.doc.textContent;
  const from = 1 + 1 + text.indexOf('photosynthesis');
  const to = from + 'photosynthesis'.length;
  act(() => { editor.commands.setTextSelection({ from, to }); });
  act(() => { editor.view.someProp('handleTextInput', (f) => f(editor.view, from, to, '\\', () => editor.view.state.tr)); });
  return { entryId, onMarkAs, from, to };
}

// A key arriving at the editor (before the menu's search box has focus).
const keyToEditor = (key: string) => act(() => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  editor.view.someProp('handleKeyDown', (f) => f(editor.view, event));
});

describe('SelectionMenu', () => {
  it('suggests the term that matches the selected words first; Enter links the text to it', () => {
    const { entryId } = setup();
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    const first = screen.getAllByRole('option')[0];
    expect(first).toHaveTextContent('Photosynthesis');
    fireEvent.keyDown(screen.getByPlaceholderText(/Link to a term/), { key: 'Enter' });
    const groups = collectRefGroups(editor.state.doc);
    expect(groups.map((g) => [g.entryId, editor.state.doc.textBetween(g.from, g.to)])).toEqual([[entryId, 'photosynthesis']]);
    expect(getSelectionMenu(editor.state)).toBeNull();
  });

  it('keys typed into the editor before the menu has focus go to the menu, not over the text', () => {
    const { onMarkAs, from, to } = setup();
    for (const ch of 'conc') keyToEditor(ch);
    expect(screen.getByPlaceholderText(/Link to a term/)).toHaveValue('conc');
    expect(editor.state.doc.textContent).toContain('photosynthesis');
    keyToEditor('Enter');
    expect(onMarkAs).toHaveBeenCalledWith('concept', from, to);
  });

  it('marks it Critical, filtered by typing', () => {
    const { from } = setup();
    fireEvent.change(screen.getByPlaceholderText(/Link to a term/), { target: { value: 'crit' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['❗Critical']);
    fireEvent.keyDown(screen.getByPlaceholderText(/Link to a term/), { key: 'Enter' });
    expect(collectImportantPassages(editor.state.doc)).toMatchObject([{ level: 3, from }]);
  });
});
