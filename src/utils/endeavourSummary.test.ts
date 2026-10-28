import { describe, expect, it } from 'vitest';
import { isBehind, rowsOfEndeavour, summarizeRows } from './endeavourSummary';
import type { Collection, CollectionId } from '@/types';
import type { OverviewRow } from '@/types/overview';

const TODAY = '2026-10-28';
const row = (id: string, o: Partial<OverviewRow>): OverviewRow => ({
  key: `task:${id}`, source: 'task', id, title: id, when: null, time: null, status: 'open', endeavourId: null, context: null, ...o,
});

describe('where an Endeavour stands', () => {
  it('behind: an open task past its date, or a deadline or reminder gone by; never an event that has happened', () => {
    expect(isBehind(row('a', { when: '2026-10-20' }), TODAY)).toBe(true);
    expect(isBehind(row('b', { source: 'deadline', when: '2026-10-20', status: 'past' }), TODAY)).toBe(true);
    expect(isBehind(row('c', { source: 'event', when: '2026-10-20', status: 'past' }), TODAY)).toBe(false);
    expect(isBehind(row('d', { when: '2026-10-20', status: 'done' }), TODAY)).toBe(false);
    expect(isBehind(row('e', { when: TODAY }), TODAY)).toBe(false);
  });

  it('this week, coming up within a month, and the next thing', () => {
    const s = summarizeRows([
      row('late', { when: '2026-10-01' }),
      row('fri', { when: '2026-10-31' }),
      row('today', { when: TODAY, time: '09:00' }),
      row('nov', { source: 'deadline', when: '2026-11-15' }),
      row('note', { source: 'note', when: '2026-11-10' }),
      row('far', { when: '2027-01-01' }),
    ], TODAY);
    expect(s.behind.map((r) => r.id)).toEqual(['late']);
    expect(s.thisWeek.map((r) => r.id)).toEqual(['today', 'fri']);
    expect(s.comingUp.map((r) => r.id)).toEqual(['nov']);
    expect(s.next?.id).toBe('today');
  });

  it('an Endeavour\'s rows include everything part of it', () => {
    const col = (id: string, o: Partial<Collection> = {}) => ({ id, kind: 'project', name: id, collectionId: null, ...o }) as unknown as Collection;
    const collections = {
      sem: col('sem'),
      sub: col('sub', { links: [{ kind: 'partOf', targetId: 'sem' as CollectionId, createdAt: TODAY }] }),
      other: col('other'),
    };
    const rows = [row('a', { endeavourId: 'sub' }), row('b', { endeavourId: 'other' }), row('c', { endeavourId: 'sem' })];
    expect(rowsOfEndeavour(rows, 'sem', collections).map((r) => r.id)).toEqual(['a', 'c']);
  });
});
