// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { MobileNotes } from './MobileNotes';

// The note screen itself is NoteEditor (its own tests); here only that it's what opens.
vi.mock('@/components/NoteEditor/NoteEditor', () => ({ NoteEditor: () => <div data-testid="note-editor" /> }));

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => cleanup());

function seed() {
  const s = useNoteStore.getState();
  const bio = s.addNoteTag({ name: 'Biology', kind: 'area' });
  const hist = s.addNoteTag({ name: 'History', kind: 'area' });
  const cells = s.addNote({ title: 'Cells', tagIds: [bio] });
  const wars = s.addNote({ title: 'Wars', tagIds: [hist] });
  return { bio, hist, cells, wars };
}

describe('Notes on a phone: the home screen', () => {
  it('lists notebooks; tapping one shows its notes inside it, tapping a note opens it full-screen', () => {
    const { cells } = seed();
    render(<MobileNotes />);
    expect(screen.getByRole('button', { name: /Biology/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cells/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Biology/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cells/ }));
    expect(useUIStore.getState().editingNoteId).toBe(cells);
    expect(screen.getByTestId('note-editor')).toBeInTheDocument();
  });

  it('Back (the screen’s own back step) closes the note and returns to the home screen', () => {
    const { cells } = seed();
    act(() => { useUIStore.getState().openNote(cells); });
    render(<MobileNotes />);
    const consumer = useUIStore.getState().mobileBackConsumer;
    expect(consumer).not.toBeNull();
    act(() => { expect(consumer!()).toBe(true); });
    expect(useUIStore.getState().editingNoteId).toBeNull();
    expect(screen.getByRole('button', { name: 'Notebooks' })).toBeInTheDocument();
    expect(useUIStore.getState().mobileNotesHome).toBe('notebooks');
  });

  it('Recent shows the notes last opened, newest first, and the choice is remembered', () => {
    vi.useFakeTimers();
    const { cells, wars } = seed();
    vi.setSystemTime(new Date('2026-10-09T09:00:00Z'));
    useNoteStore.getState().touchNote(cells);
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
    useNoteStore.getState().touchNote(wars);
    vi.useRealTimers();

    render(<MobileNotes />);
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }));
    const titles = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(titles).toEqual(['Wars', 'Cells']);
    expect(useUIStore.getState().mobileNotesHome).toBe('recent');

    fireEvent.click(screen.getAllByRole('article')[1]);
    expect(useUIStore.getState().editingNoteId).toBe(cells);
  });
});
