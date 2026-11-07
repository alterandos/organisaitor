import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/store/uiStore';
import { useNoteStore } from '@/store/noteStore';
import { openNewItem } from './newItem';
import type { NoteTagId } from '@/types/notes';
import { SCRATCHPAD_PRESET, STICKIES_PRESET, takesNotes } from '@/utils/notes';

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

  it('Stickies and the Scratchpad take no notes or notebooks (2026-11-01)', () => {
    const stickies = useNoteStore.getState().addNoteTag({ name: 'Stickies', kind: 'area', presetKey: STICKIES_PRESET }) as NoteTagId;
    const pad = useNoteStore.getState().addNoteTag({ name: 'Scratchpad', kind: 'area', presetKey: SCRATCHPAD_PRESET }) as NoteTagId;
    useUIStore.setState({ activeView: 'notes', selectedNoteTagId: stickies, notesFocusedColumn: 'list' });
    const before = Object.keys(useNoteStore.getState().notes).length;
    openNewItem('notes');
    expect(useUIStore.getState().openModal).toBeNull();
    expect(Object.values(useNoteStore.getState().notes).filter((n) => n.tagIds.includes(stickies))).toHaveLength(before + 1);
    useUIStore.setState({ selectedNoteTagId: pad });
    openNewItem('notes');
    expect(useUIStore.getState().pad?.kind).toBe('scratchpad');
    expect(useUIStore.getState().openModal).toBeNull();
    useUIStore.setState({ notesFocusedColumn: 'tree' });
    openNewItem('notes');
    expect(useUIStore.getState().pendingNoteTagParentId).toBeNull();
    expect(takesNotes(useNoteStore.getState().noteTags[pad])).toBe(false);
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
  it('Endeavours: the page makes an Endeavour; a home makes a task', () => {
    openNewItem('endeavours');
    expect(useUIStore.getState().creator).toEqual({ partOf: null });
    useUIStore.getState().closeCreator();
    useUIStore.setState({ endeavourHomeId: 'e1' });
    openNewItem('endeavours');
    expect(useUIStore.getState().openModal).toBe('add-task');
  });

});
