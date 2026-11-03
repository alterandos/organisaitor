import { describe, expect, it } from 'vitest';
import { firstSentences, notesOnThisDay, pickForDay, readWikiFeed } from './todayFacts';

describe('the Today card (2026-11-02)', () => {
  it("reads Wikipedia's featured feed: the featured article and the day's events, anything odd dropped", () => {
    const today = readWikiFeed('2026-11-02', {
      tfa: { titles: { normalized: 'Ada Lovelace' }, extract: ' Ada was a mathematician. ', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Ada' } } },
      onthisday: [{ text: 'An event.', year: 1901, pages: [{ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/E' } } }] }, { text: 'No year' }, { year: 5 }],
    });
    expect(today).toEqual({
      date: '2026-11-02',
      featured: { title: 'Ada Lovelace', text: 'Ada was a mathematician.', url: 'https://en.wikipedia.org/wiki/Ada' },
      onThisDay: [{ year: 1901, text: 'An event.', url: 'https://en.wikipedia.org/wiki/E', title: null }],
    });
    expect(readWikiFeed('2026-11-02', null)).toEqual({ date: '2026-11-02', featured: null, onThisDay: [] });
  });

  it('takes the opening sentences of an article', () => {
    expect(firstSentences('One. Two! Three? Four.', 2)).toBe('One. Two!');
    expect(firstSentences('No full stop')).toBe('No full stop');
    expect(firstSentences('Born 1815 in St. James. Died 1852.', 1)).toBe('Born 1815 in St. James.');
  });

  it('shows the same thing all day, and Another moves on', () => {
    const a = pickForDay(5, '2026-11-02');
    expect(pickForDay(5, '2026-11-02')).toBe(a);
    expect(pickForDay(5, '2026-11-02', 1)).toBe((a + 1) % 5);
    expect(pickForDay(0, '2026-11-02')).toBe(-1);
  });

  it("finds notes made on this day in earlier years, the latest year first", () => {
    const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
    const notes = [
      { id: 'a', title: 'Two years ago', createdAt: at(2024, 11, 2), archivedAt: null },
      { id: 'b', title: 'Last year', createdAt: at(2025, 11, 2), archivedAt: null },
      { id: 'c', title: 'Today', createdAt: at(2026, 11, 2), archivedAt: null },
      { id: 'd', title: 'Another day', createdAt: at(2025, 11, 3), archivedAt: null },
      { id: 'e', title: 'Archived', createdAt: at(2025, 11, 2), archivedAt: at(2025, 12, 1) },
      { id: 'f', title: ' ', createdAt: at(2025, 11, 2), archivedAt: null },
    ];
    expect(notesOnThisDay(notes, '2026-11-02')).toEqual([{ id: 'b', years: 1 }, { id: 'a', years: 2 }]);
  });
});
