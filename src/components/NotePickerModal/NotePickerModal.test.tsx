// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NotePickerModal } from './NotePickerModal';
import { useNoteStore } from '@/store/noteStore';
import { usePinnedItemsStore } from '@/store/pinnedItemsStore';

Element.prototype.scrollIntoView = () => {};

let pinned: string;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  usePinnedItemsStore.setState({ pins: {} });
  pinned = useNoteStore.getState().addNote({ title: 'Pinned one' });
  useNoteStore.getState().addNote({ title: 'Recent one' });
  usePinnedItemsStore.getState().pin('note', pinned);
});
afterEach(cleanup);

const titles = () => Array.from(document.body.querySelectorAll('button')).map((b) => b.textContent ?? '');

describe('the note picker', () => {
  it('with pinnedFirst, the pinned notes come first under Pinned, then Recent (2026-11-02)', () => {
    render(<NotePickerModal excludeIds={new Set()} suggestFrom="" pinnedFirst onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    const order = titles().filter((t) => t.includes(' one'));
    expect(order[0]).toContain('Pinned one');
    expect(order[1]).toContain('Recent one');
  });

  it('without it, no Pinned section', () => {
    render(<NotePickerModal excludeIds={new Set()} suggestFrom="" onPick={() => {}} onClose={() => {}} />);
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument();
  });
});
