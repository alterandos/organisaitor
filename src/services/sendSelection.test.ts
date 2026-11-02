import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { appendToScratchpadDoc, sendToScratchpad, turnIntoSticky } from './sendSelection';
import { scratchpadNote, scratchpadText } from './scratchpad';
import { stickyNotes, stickyDocOf, stickyText } from './stickyNotes';
import { noteView } from './noteSecrets';
import type { StickyDoc } from './stickyNotes';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T09:30:00'));
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => vi.useRealTimers());

describe('sending selected text on (copies)', () => {
  it('the scratchpad gets it at its end, after a blank line, with the stamp in italics after it', () => {
    const doc: StickyDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Milk' }] }] };
    const out = appendToScratchpadDoc(doc, 'Line one\nLine two', '(sent 1 Nov)');
    expect(stickyText(out)).toBe('Milk\n\nLine one\nLine two\n(sent 1 Nov)');
    expect(out.content.at(-1)?.content?.[0]).toMatchObject({ marks: [{ type: 'italic' }] });
    const empty: StickyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
    expect(stickyText(appendToScratchpadDoc(empty, 'Hi', 's'))).toBe('Hi\ns');
  });

  it('Send to scratchpad copies the text there, saying when and from which note', async () => {
    const from = useNoteStore.getState().addNote({ title: 'Lectures' });
    await sendToScratchpad('Osmosis moves water', from);
    const pad = scratchpadNote(useNoteStore.getState().notes, useNoteStore.getState().noteTags)!;
    const text = scratchpadText(pad);
    expect(text).toContain('Osmosis moves water');
    expect(text).toMatch(/\(sent .*from Lectures\)$/);
  });

  it('Turn into a sticky makes a sticky holding the text', async () => {
    await turnIntoSticky('Call Sam\nabout the notebook', null);
    const stickies = stickyNotes(useNoteStore.getState().notes, useNoteStore.getState().noteTags);
    expect(stickies).toHaveLength(1);
    expect(stickyText(stickyDocOf(noteView(stickies[0]).content)!)).toBe('Call Sam\nabout the notebook');
  });
});
