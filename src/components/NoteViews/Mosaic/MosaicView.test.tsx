// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useNoteStore } from '@/store/noteStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import type { NoteTagId } from '@/types/notes';
import { MosaicView } from './MosaicView';

// The editor is mounted by the note level; its own tests cover it.
vi.mock('@/components/NoteEditor/NoteEditor', () => ({ NoteEditor: () => <div data-testid="editor" /> }));
vi.mock('@/components/NoteSplitView/NoteSplitView', () => ({ NoteSplitView: () => <div data-testid="split" /> }));

let uni: NoteTagId;
let bio: NoteTagId;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  const ns = useNoteStore.getState();
  uni = ns.addNoteTag({ name: 'University', kind: 'area' }) as NoteTagId;
  bio = ns.addNoteTag({ name: 'Biology', kind: 'area', parentTagId: uni }) as NoteTagId;
  ns.addNote({ title: 'Cells', tagIds: [bio] });
  ns.addNote({ title: 'Enzymes', tagIds: [bio] });
  ns.addNote({ title: 'Loose thoughts' });
  useUIStore.setState({ activeView: 'notes', notesView: 'mosaic', notesBrowseView: 'mosaic' });
});
afterEach(() => cleanup());

describe('the Mosaic', () => {
  it('shows the top level: a tile per notebook and the notes in none; going in and out by the trail', () => {
    render(<MosaicView />);
    expect(screen.getByRole('button', { name: /^University, 2 notes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Loose thoughts/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^University/ }));
    expect(useUIStore.getState().selectedNoteTagId).toBe(uni);
    expect(screen.getByRole('button', { name: /^Biology, 2 notes/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Loose thoughts/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All notes' }));
    expect(useUIStore.getState().selectedNoteTagId).toBeNull();
  });

  it('Space bursts a tile open round it; its items go straight in; Esc closes it', () => {
    act(() => useUIStore.getState().setNotesFocus(`notebook:${uni}`));
    render(<MosaicView />);
    const tile = screen.getByRole('button', { name: /^Biology/ });
    fireEvent.keyDown(tile, { key: ' ' });
    expect(tile).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Cells/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(tile).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(tile, { key: ' ' });
    fireEvent.click(screen.getByRole('button', { name: 'Enzymes' }));
    const open = useUIStore.getState().editingNoteId;
    expect(useNoteStore.getState().notes[open as never]?.title).toBe('Enzymes');
  });

  it('a note open is the deepest level: the editor, the notes beside it, and the way back', () => {
    act(() => useUIStore.getState().setNotesFocus(`notebook:${bio}`));
    render(<MosaicView />);
    fireEvent.click(screen.getByRole('button', { name: /^Cells/ }));
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Notes here' })).toHaveTextContent('Enzymes');
    fireEvent.click(screen.getByRole('button', { name: /Back to Biology/ }));
    expect(useUIStore.getState().editingNoteId).toBeNull();
    expect(screen.getByRole('button', { name: /^Enzymes/ })).toBeInTheDocument();
  });

  it('grouping and filter: by tag, then only notes with a chosen tag', () => {
    const ns = useNoteStore.getState();
    const key = ns.addNoteTag({ name: 'Key idea', kind: 'tag' }) as NoteTagId;
    const cells = Object.values(useNoteStore.getState().notes).find((n) => n.title === 'Cells')!;
    act(() => useNoteStore.getState().updateNote(cells.id, { tagIds: [...cells.tagIds, key] }));
    render(<MosaicView />);
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    expect(screen.getByRole('button', { name: /^Key idea, 1 note/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Key idea', pressed: false }));
    expect(useUIStore.getState().notesFilter.tagIds).toEqual([key]);
    expect(screen.queryByRole('button', { name: /^Loose thoughts/ })).toBeNull();
  });
});
