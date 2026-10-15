import { beforeEach, describe, expect, it } from 'vitest';
import { useNoteStore } from '@/store/noteStore';
import { SWATCHES } from '@/config/swatches';
import { noteColorMenuItem } from './noteColorMenu';
import type { NoteId } from '@/types';

beforeEach(() => { useNoteStore.setState(useNoteStore.getInitialState(), true); });

describe('a note’s colour from the menus', () => {
  it('offers No colour and the whole palette, ticks the current one, and sets it', () => {
    const id = useNoteStore.getState().addNote({ title: 'A' }) as NoteId;
    const item = noteColorMenuItem(id);
    const [none, palette] = item.submenu!;
    expect(none.map((i) => i.id)).toEqual(['none']);
    expect(palette.map((i) => i.id)).toEqual(SWATCHES.map((s) => s.id));
    void palette.find((i) => i.id === 'teal')!.run!();
    expect(useNoteStore.getState().notes[id].color).toBe(SWATCHES.find((s) => s.id === 'teal')!.hex);
    expect(noteColorMenuItem(id).submenu![1].find((i) => i.id === 'teal')!.icon).toBe('✓');
    void noteColorMenuItem(id).submenu![0][0].run!();
    expect(useNoteStore.getState().notes[id].color).toBeNull();
  });
});
