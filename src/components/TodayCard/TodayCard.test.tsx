// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TodayCard } from './TodayCard';
import { useSettingsStore } from '@/store/settingsStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { factsList, hasFact } from '@/services/interestingFacts';
import type { NoteId } from '@/types/notes';

const FEED = {
  tfa: { titles: { normalized: 'Ada Lovelace' }, extract: 'Ada Lovelace was a mathematician. She wrote the first program. More.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Ada' } } },
  onthisday: [{ text: 'Something happened.', year: 1901, pages: [] }],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 9));
  localStorage.clear();
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useListStore.setState(useListStore.getInitialState(), true);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(FEED))));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('the Today card (2026-11-02)', () => {
  it("shows Wikipedia's fact and a moment of history, and keeps one in Interesting facts", async () => {
    render(<TodayCard />);
    expect(await screen.findByText(/She wrote the first program\./)).toBeInTheDocument();
    expect(screen.queryByText(/More\./)).not.toBeInTheDocument();
    expect(screen.getByText('On this day in 1901')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getAllByText(/Keep in Interesting facts/)[0]); });
    expect(factsList()).not.toBeNull();
    expect(hasFact('Ada Lovelace was a mathematician. She wrote the first program.')).toBe(true);
    expect(screen.getByText(/Kept/)).toBeInTheDocument();
  });

  it('shows a note from this day in an earlier year, and hides until tomorrow', async () => {
    const id = useNoteStore.getState().addNote({ title: 'Last year’s plan' }) as NoteId;
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [id]: { ...s.notes[id], createdAt: new Date(2025, 10, 2, 12).toISOString() } } }));
    useSettingsStore.getState().setTodayCard({ fact: false, history: false });
    render(<TodayCard />);
    expect(screen.getByText('A year ago in your notes')).toBeInTheDocument();
    expect(screen.getByText(/Last year’s plan/)).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByLabelText('Hide until tomorrow')); });
    expect(screen.queryByText('A year ago in your notes')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().todayCardHiddenOn).toBe('2026-11-02');
  });

  it('shows nothing when turned off', () => {
    useSettingsStore.getState().setTodayCard({ show: false });
    const { container } = render(<TodayCard />);
    expect(container).toBeEmptyDOMElement();
  });
});
