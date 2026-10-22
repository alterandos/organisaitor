// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useCardTermLinks } from './CardTermLinks';
import { useNoteStore } from '@/store/noteStore';
import { useSettingsStore } from '@/store/settingsStore';
import { defineInItsNote } from '@/test/glossaryFixtures';
import type { NoteId } from '@/types';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let termId: string;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useSettingsStore.setState({ linkSuggestions: 'once' });
  const notes = useNoteStore.getState();
  const noteId = notes.addNote({ title: 'Finance' }) as NoteId;
  termId = notes.addStructuredTagEntry({ typeKey: 'acronym', tagId: 'builtin-acronym', term: 'ASX', fields: { expansion: 'Australian Stock Exchange' }, noteId, collectionId: null });
  defineInItsNote(termId);
});
afterEach(cleanup);

function Field() {
  const ref = useRef<HTMLDivElement>(null);
  const links = useCardTermLinks('self-entry');
  return (
    <>
      <div ref={ref} contentEditable suppressContentEditableWarning data-testid="field"
        onInput={() => links.onInput(ref.current!)} onKeyDown={(e) => links.onKeyDown(e, e.currentTarget)} />
      {links.overlay}
    </>
  );
}

// Types into the field as the browser would: the text, the caret at its end, then an input event.
function typeText(field: HTMLElement, text: string) {
  field.textContent = (field.textContent ?? '') + text;
  const node = field.lastChild!;
  const range = document.createRange();
  range.setStart(node, node.textContent!.length);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.input(field);
}

describe('linking Glossary terms inside a card field', () => {
  it('typing a term offers it; Enter wraps it in a term link', () => {
    render(<Field />);
    const field = screen.getByTestId('field');
    act(() => typeText(field, 'Listed on the ASX'));
    expect(screen.getByRole('status')).toHaveTextContent('ASX');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.innerHTML).toBe(`Listed on the <a data-term="${termId}">ASX</a>`);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('nothing is offered mid-word, or with the setting at Never', () => {
    render(<Field />);
    const field = screen.getByTestId('field');
    act(() => typeText(field, 'BASX'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    useSettingsStore.setState({ linkSuggestions: 'never' });
    act(() => typeText(field, ' ASX'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
