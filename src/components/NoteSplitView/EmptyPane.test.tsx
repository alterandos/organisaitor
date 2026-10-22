// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EmptyPane } from './EmptyPane';
import { useNoteStore } from '@/store/noteStore';
import { usePinnedItemsStore } from '@/store/pinnedItemsStore';
import { useRecentItemsStore } from '@/store/recentItemsStore';

let ids: Record<string, string>;
beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  usePinnedItemsStore.setState({ pins: {} });
  useRecentItemsStore.setState({ items: {} });
  const add = useNoteStore.getState().addNote;
  ids = { pinned: add({ title: 'Pinned plan' }), recent: add({ title: 'Recent lecture' }), open: add({ title: 'Already open' }) };
  usePinnedItemsStore.getState().pin('note', ids.pinned);
  useRecentItemsStore.getState().recordVisit('note', ids.recent);
  useRecentItemsStore.getState().recordVisit('note', ids.open);
});
afterEach(cleanup);

describe('the empty pane of notes side by side', () => {
  it('shows pinned notes as cards and recent notes below, leaving out notes open elsewhere; a click opens one', () => {
    const onPick = vi.fn();
    render(<EmptyPane openIds={new Set([ids.open])} onPick={onPick} onChoose={vi.fn()} />);
    expect(screen.getByText('Pinned plan')).toBeInTheDocument();
    expect(screen.getByText('Recent lecture')).toBeInTheDocument();
    expect(screen.queryByText('Already open')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Recent lecture'));
    expect(onPick).toHaveBeenCalledWith(ids.recent);
  });

  it('typing searches every note; Enter opens the first match', () => {
    const onPick = vi.fn();
    render(<EmptyPane openIds={new Set()} onPick={onPick} onChoose={vi.fn()} />);
    const box = screen.getByLabelText('Search notes');
    fireEvent.change(box, { target: { value: 'lecture' } });
    expect(screen.queryByText('Pinned plan')).not.toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(ids.recent);
  });
});
