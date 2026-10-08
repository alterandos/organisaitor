// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useNoteStore } from '@/store/noteStore';
import { LinkedNoteAbstracts } from './LinkedNoteAbstracts';
import type { NoteId } from '@/types/notes';

beforeEach(() => useNoteStore.setState(useNoteStore.getInitialState(), true));
afterEach(() => cleanup());

const make = (title: string, abstract: string | null) => {
  const id = useNoteStore.getState().addNote({ title });
  useNoteStore.getState().updateNote(id, { abstract });
  return id;
};

describe("a calendar item's linked notes' abstracts", () => {
  it('shows each linked note that has an abstract, once, and none without', () => {
    const a = make('Photosynthesis', 'How light becomes sugar.');
    const b = make('Empty', null);
    render(<LinkedNoteAbstracts refs={[{ type: 'note', id: a }, { type: 'note', id: a, tabId: 't' }, { type: 'note', id: b }, { type: 'list', id: 'l' }]} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveValue('How light becomes sugar.');
    expect(screen.getByText(/From the note “Photosynthesis”/)).toBeInTheDocument();
  });

  it("editing it changes the note's abstract, and a change in the note shows here", () => {
    const a = make('Photosynthesis', 'Old.');
    render(<LinkedNoteAbstracts refs={[{ type: 'note', id: a }]} />);
    const box = screen.getByRole('textbox');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'Light into sugar, in the chloroplast.' } });
    fireEvent.blur(box);
    expect(useNoteStore.getState().notes[a as NoteId].abstract).toBe('Light into sugar, in the chloroplast.');
    // Edited in the note itself, while the pane is open.
    act(() => { useNoteStore.getState().updateNote(a, { abstract: 'Rewritten in the note.' }); });
    expect(screen.getByRole('textbox')).toHaveValue('Rewritten in the note.');
  });
});
