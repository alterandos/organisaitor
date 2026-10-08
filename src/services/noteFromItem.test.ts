import { beforeEach, describe, expect, it } from 'vitest';
import { useNoteStore } from '@/store/noteStore';
import { createNoteForItem, newNoteTitleFor } from './noteFromItem';
import type { NoteId } from '@/types/notes';

beforeEach(() => useNoteStore.setState(useNoteStore.getInitialState(), true));

describe('a new note from a calendar item', () => {
  it('in a notebook: a new note there, linked as a whole', () => {
    const nb = useNoteStore.getState().addNoteTag({ name: 'Biology', kind: 'area' });
    const ref = createNoteForItem({ kind: 'notebook', id: nb }, 'Lecture 4 · Oct 8, 2026');
    const note = useNoteStore.getState().notes[ref.id as NoteId];
    expect(ref).toEqual({ type: 'note', id: note.id });
    expect(note).toMatchObject({ title: 'Lecture 4 · Oct 8, 2026', tagIds: [nb] });
  });

  it('outside any notebook', () => {
    const ref = createNoteForItem({ kind: 'notebook', id: null }, 'Dentist');
    expect(useNoteStore.getState().notes[ref.id as NoteId].tagIds).toEqual([]);
  });

  it('in a note: a new tab, and the link names that tab', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Biology lectures' });
    const ref = createNoteForItem({ kind: 'note', id: noteId }, 'Lecture 5');
    const note = useNoteStore.getState().notes[noteId];
    expect(note.tabs.map((t) => t.name)).toEqual(['Lecture 5']);
    expect(ref).toEqual({ type: 'note', id: noteId, tabId: note.tabs[0].id });
  });

  it('is named after the item and its date (the day itself, whatever the time zone)', () => {
    expect(newNoteTitleFor(' Lecture ', '2026-10-08')).toMatch(/^Lecture · .*8.*2026$/);
    expect(newNoteTitleFor('Lecture', null)).toBe('Lecture');
  });
});
