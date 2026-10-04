import { describe, expect, it } from 'vitest';
import { rankSearch, rankSuggestions, type RankField } from './suggestRank';

interface Item { id: string; title: string; body: string; at: number }
const items: Item[] = [
  { id: 'a', title: 'Buy groceries', body: '', at: 5 },
  { id: 'b', title: 'Biology exam revision', body: '', at: 1 },
  { id: 'c', title: 'Book exam room', body: 'biology department', at: 2 },
  { id: 'd', title: 'Call plumber', body: '', at: 9 },
];
const fields = (i: Item): RankField[] => [{ text: i.title, weight: 3 }, { text: i.body, weight: 1, counted: true }];
const at = (i: Item) => i.at;

describe('rankSuggestions', () => {
  it('puts keyword hits first (title outweighs body, rare words outweigh common), then the rest by recency', () => {
    const r = rankSuggestions(items, fields, at, 'Study for the biology exam');
    expect(r.keywords).toEqual(['study', 'biology', 'exam']);
    expect(r.items.map((i) => i.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(r.suggested).toBe(2);
  });

  it('with nothing to suggest from, it is simply most recent first', () => {
    const r = rankSuggestions(items, fields, at, '');
    expect(r.items.map((i) => i.id)).toEqual(['d', 'a', 'c', 'b']);
    expect(r.suggested).toBe(0);
  });

  it('matches word stems ("exams" finds "exam")', () => {
    expect(rankSuggestions(items, fields, at, 'exams').items.slice(0, 2).map((i) => i.id).sort()).toEqual(['b', 'c']);
  });
});

describe('rankSearch', () => {
  it('keeps only candidates matching every word, title hits first', () => {
    expect(rankSearch(items, fields, at, 'exam bio').map((i) => i.id)).toEqual(['b', 'c']);
    expect(rankSearch(items, fields, at, 'plumb').map((i) => i.id)).toEqual(['d']);
  });
});
