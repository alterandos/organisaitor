import { beforeEach, describe, expect, it } from 'vitest';
import { useNoteStore } from '@/store/noteStore';
import { ensureScratchpad, scratchpadNote, scratchpadText } from './scratchpad';
import { setStickyContent, stickyDocOf, docForText } from './stickyNotes';
import { byNotebookOrder, isPinnedNotebook, STICKIES_PRESET } from '@/utils/notes';
import type { NoteId } from '@/types/notes';

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
});

const note = (id: NoteId) => useNoteStore.getState().notes[id];

describe('the scratchpad', () => {
  it('is made once: a note in its own notebook, found again after', () => {
    const id = ensureScratchpad();
    expect(ensureScratchpad()).toBe(id);
    const { notes, noteTags } = useNoteStore.getState();
    expect(scratchpadNote(notes, noteTags)?.id).toBe(id);
    expect(Object.values(noteTags).filter((t) => t.presetKey === 'scratchpad')).toHaveLength(1);
    expect(note(id).title).toBe('Scratchpad');
  });

  it('keeps its name whatever is written in it, and gives its text back as plain lines', () => {
    const id = ensureScratchpad();
    setStickyContent(id, stickyDocOf(docForText('milk\n\neggs'))!, true);
    expect(note(id).title).toBe('Scratchpad');
    expect(scratchpadText(note(id))).toBe('milk\n\neggs');
  });

  it('its notebook is pinned at the top, after Stickies', () => {
    ensureScratchpad();
    const store = useNoteStore.getState();
    store.addNoteTag({ name: 'Biology', kind: 'area' });
    store.addNoteTag({ name: 'Stickies', kind: 'area', presetKey: STICKIES_PRESET });
    const roots = Object.values(useNoteStore.getState().noteTags).filter((t) => !t.parentTagId).sort(byNotebookOrder);
    expect(roots.map((t) => t.name)).toEqual(['Stickies', 'Scratchpad', 'Biology']);
    expect(roots.map(isPinnedNotebook)).toEqual([true, true, false]);
  });
});
