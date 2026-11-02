import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DWELL_MS, REVISIT_MS, STAY_MS, frecency, joinVisits, setVisitFrontCheck, useRecentItemsStore, type RecentItemEntry } from './recentItemsStore';

// What counts toward Frequent (2026-11-01): a visit dwelt on, once per REVISIT_MS, fading with age.
describe('recent items: what counts as a visit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T09:00:00Z'));
    useRecentItemsStore.setState(useRecentItemsStore.getInitialState(), true);
  });
  afterEach(() => vi.useRealTimers());

  const entry = (key: string) => useRecentItemsStore.getState().items[key];

  it('a note passed through on the way to another is recent, but not counted', () => {
    const { recordVisit } = useRecentItemsStore.getState();
    recordVisit('note', 'a');
    vi.advanceTimersByTime(1_000);
    recordVisit('note', 'b');
    vi.advanceTimersByTime(DWELL_MS);
    expect(entry('note:a')).toMatchObject({ visitCount: 0 });
    expect(entry('note:b')).toMatchObject({ visitCount: 1 });
  });

  it('things of different types wait out their dwell separately', () => {
    const { recordVisit } = useRecentItemsStore.getState();
    recordVisit('notebook', 'nb');
    recordVisit('note', 'a');
    vi.advanceTimersByTime(DWELL_MS);
    expect(entry('notebook:nb').visitCount).toBe(1);
    expect(entry('note:a').visitCount).toBe(1);
  });

  it('coming back within the revisit window is not another visit', () => {
    const { recordVisit } = useRecentItemsStore.getState();
    for (let i = 0; i < 4; i++) {
      recordVisit('note', 'a'); vi.advanceTimersByTime(DWELL_MS);
      recordVisit('note', 'b'); vi.advanceTimersByTime(DWELL_MS);
    }
    expect(entry('note:a').visitCount).toBe(1);
    vi.advanceTimersByTime(REVISIT_MS);
    recordVisit('note', 'a'); vi.advanceTimersByTime(DWELL_MS);
    expect(entry('note:a').visitCount).toBe(2);
  });

  it('older visits count for less: a fortnight halves one', () => {
    const now = Date.parse('2026-11-15T09:00:00Z');
    const fresh = frecency({ type: 'note', entityId: 'a', lastVisitedAt: '', visitCount: 1, visits: ['2026-11-15T09:00:00Z'] }, now);
    const old = frecency({ type: 'note', entityId: 'b', lastVisitedAt: '', visitCount: 1, visits: ['2026-11-01T09:00:00Z'] }, now);
    expect(fresh).toBeCloseTo(1);
    expect(old).toBeCloseTo(0.5);
  });
});

// Synced since 2026-11-02: two devices' copies are joined, so neither device's visits are lost.
describe('recent items: joining two devices visits', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  const e = (visits: string[], last: string, updatedAt = last): RecentItemEntry =>
    ({ type: 'note', entityId: 'n', lastVisitedAt: last, visitCount: visits.length, visits, updatedAt });

  it('keeps every visit from both, in order, and the later last visit', () => {
    const joined = joinVisits(e(['2026-11-01T08:00:00Z', '2026-11-02T08:00:00Z'], '2026-11-02T08:00:00Z'), e(['2026-11-01T08:00:00Z', '2026-11-01T20:00:00Z'], '2026-11-01T20:00:00Z'));
    expect(joined.visits).toEqual(['2026-11-01T08:00:00Z', '2026-11-01T20:00:00Z', '2026-11-02T08:00:00Z']);
    expect(joined.lastVisitedAt).toBe('2026-11-02T08:00:00Z');
    // The cloud lacked one, so it's restamped to be sent back up.
    expect(joined.updatedAt).toBe('2026-11-02T12:00:00.000Z');
  });

  it('takes the cloud copy unchanged when it already has everything', () => {
    const remote = e(['2026-11-01T08:00:00Z', '2026-11-01T20:00:00Z'], '2026-11-01T20:00:00Z', '2026-11-01T20:00:05Z');
    const joined = joinVisits(e(['2026-11-01T08:00:00Z'], '2026-11-01T08:00:00Z'), remote);
    expect(joined.visits).toEqual(remote.visits);
    expect(joined.updatedAt).toBe(remote.updatedAt);
  });

  it('keeps at most the last 60', () => {
    const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}T08:00:00Z`;
    const a = Array.from({ length: 35 }, (_, i) => `2026-09-${String(i % 30 + 1).padStart(2, '0')}T${String(Math.floor(i / 30)).padStart(2, '0')}:00:00Z`);
    const b = Array.from({ length: 30 }, (_, i) => day(i + 1));
    const joined = joinVisits(e(a, day(15)), e(b, day(30)));
    expect(joined.visits).toHaveLength(60);
    expect(joined.visits?.[59]).toBe(day(30));
  });
});

// 2026-11-02: time spent counts. Staying in front counts another visit every STAY_MS (5 minutes).
describe('recent items: staying on something counts', () => {
  let front: string | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T09:00:00Z'));
    useRecentItemsStore.setState(useRecentItemsStore.getInitialState(), true);
    front = null;
    setVisitFrontCheck((_type, id) => id === front);
  });
  afterEach(() => { setVisitFrontCheck(() => false); vi.useRealTimers(); });
  const count = (key: string) => useRecentItemsStore.getState().items[key]?.visits?.length ?? 0;

  it('a visit every 5 minutes while it stays in front, none once it is left', () => {
    front = 'a';
    useRecentItemsStore.getState().recordVisit('note', 'a');
    vi.advanceTimersByTime(DWELL_MS);
    expect(count('note:a')).toBe(1);
    vi.advanceTimersByTime(STAY_MS * 3);
    expect(count('note:a')).toBe(4);
    front = null;
    vi.advanceTimersByTime(STAY_MS * 3);
    expect(count('note:a')).toBe(4);
  });

  it('opening another of the same type stops the first being counted', () => {
    front = 'a';
    useRecentItemsStore.getState().recordVisit('note', 'a');
    vi.advanceTimersByTime(DWELL_MS);
    front = 'b';
    useRecentItemsStore.getState().recordVisit('note', 'b');
    vi.advanceTimersByTime(DWELL_MS + STAY_MS * 2);
    expect(count('note:a')).toBe(1);
    expect(count('note:b')).toBe(3);
  });

  it('a return within 5 minutes of a counted visit is not counted again', () => {
    expect(REVISIT_MS).toBe(STAY_MS);
  });
});
