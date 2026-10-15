import { beforeEach, describe, expect, it } from 'vitest';
import { useNoteStore } from '@/store/noteStore';
import { useStickyStore } from '@/store/stickyStore';
import { useTrashStore } from '@/store/trashStore';
import { useToastStore } from '@/store/toastStore';
import { addSticky, docForText, plainTextOf, removeSticky, setStickyText, stickiesNotebook, stickyNotes } from './stickyNotes';

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useStickyStore.setState(useStickyStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
});

const stickies = () => stickyNotes(useNoteStore.getState().notes, useNoteStore.getState().noteTags);

describe('sticky notes', () => {
  it('are notes in one Stickies notebook, made the first time; each new one is placed off the last', () => {
    const a = addSticky();
    const b = addSticky();
    const books = Object.values(useNoteStore.getState().noteTags).filter((t) => t.presetKey === 'stickies');
    expect(books).toHaveLength(1);
    expect(stickiesNotebook(useNoteStore.getState().noteTags)?.name).toBe('Stickies');
    expect(stickies().map((n) => n.id)).toEqual([a, b]);
    const pa = useStickyStore.getState().places[a];
    const pb = useStickyStore.getState().places[b];
    expect(pb.x).toBeLessThan(pa.x);
    expect(pb.y).toBeGreaterThan(pa.y);
  });

  it('write plain text into the note, its first line the title', () => {
    const id = addSticky();
    setStickyText(id, 'Buy milk\n\nand eggs');
    const note = useNoteStore.getState().notes[id];
    expect(note.title).toBe('Buy milk');
    expect(plainTextOf(note.content)).toBe('Buy milk\n\nand eggs');
  });

  it('read plain paragraphs back, but not a note with formatting', () => {
    expect(plainTextOf('')).toBe('');
    expect(plainTextOf(docForText('one\ntwo'))).toBe('one\ntwo');
    const bold = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] }] });
    const heading = JSON.stringify({ type: 'doc', content: [{ type: 'heading', content: [{ type: 'text', text: 'x' }] }] });
    expect(plainTextOf(bold)).toBeNull();
    expect(plainTextOf(heading)).toBeNull();
  });

  it('removing one deletes its note to the Recycling Bin, and Undo brings it back', () => {
    const id = addSticky();
    setStickyText(id, 'Keep me');
    removeSticky(id);
    expect(stickies()).toHaveLength(0);
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(1);
    useToastStore.getState().current!.actions![0].onClick();
    expect(stickies().map((n) => n.id)).toEqual([id]);
    expect(useStickyStore.getState().places[id]).toBeDefined();
  });
});
