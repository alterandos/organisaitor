import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DWELL_MS, REVISIT_MS, frecency, useRecentItemsStore } from './recentItemsStore';

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
