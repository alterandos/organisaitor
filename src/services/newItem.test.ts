import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/store/uiStore';
import { useNoteStore } from '@/store/noteStore';
import { openNewItem } from './newItem';
import type { NoteTagId } from '@/types/notes';

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
});

describe('openNewItem (N / Space / Ctrl+N)', () => {
  it('Notes, Chronicle column: a new notebook inside the selected notebook', () => {
    const bio = useNoteStore.getState().addNoteTag({ name: 'Biology', kind: 'area' }) as NoteTagId;
    useUIStore.setState({ activeView: 'notes', selectedNoteTagId: bio, notesFocusedColumn: 'tree' });
    openNewItem('notes');
    const ui = useUIStore.getState();
    expect(ui.openModal).toBe('add-note-tag');
    expect(ui.pendingNoteTagKind).toBe('area');
    expect(ui.pendingNoteTagParentId).toBe(bio);
  });

  it('Notes, Chronicle column with nothing selected: a top-level notebook', () => {
    useUIStore.setState({ activeView: 'notes', notesFocusedColumn: 'tree' });
    openNewItem('notes');
    expect(useUIStore.getState().openModal).toBe('add-note-tag');
    expect(useUIStore.getState().pendingNoteTagParentId).toBeNull();
  });

  it('Notes, notes column or editor: a new note', () => {
    for (const col of ['list', 'editor'] as const) {
      useUIStore.setState({ ...useUIStore.getInitialState(), activeView: 'notes', notesFocusedColumn: col });
      openNewItem('notes');
      expect(useUIStore.getState().openModal).toBe('add-note');
    }
  });

  it('entering Notes starts in the Chronicle column', () => {
    useUIStore.setState({ activeView: 'tasks', notesFocusedColumn: 'list' });
    useUIStore.getState().setActiveView('notes');
    expect(useUIStore.getState().notesFocusedColumn).toBe('tree');
  });

  it('other sections keep their one obvious thing', () => {
    openNewItem('tasks');
    expect(useUIStore.getState().openModal).toBe('add-task');
    useUIStore.getState().closeModal();
    openNewItem('calendar');
    expect(useUIStore.getState().openModal).toBe('add-calendar-item');
  });
});
