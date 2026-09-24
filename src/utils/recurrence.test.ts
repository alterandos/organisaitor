import { describe, expect, it } from 'vitest';
import { endedBefore, expandRepeat, isOccurrenceSkipped, tailOf, withException } from '@/utils/recurrence';
import type { RepeatConfig } from '@/types';

function repeat(overrides: Partial<RepeatConfig>): RepeatConfig {
  return { freq: 'daily', interval: 1, endKind: 'forever', count: null, until: null, ...overrides };
}

describe('expandRepeat', () => {
  it('expands daily with an interval, excluding the base date', () => {
    const dates = expandRepeat('2026-01-01', repeat({ interval: 2 }), '2026-01-01', '2026-01-10');
    expect(dates).toEqual(['2026-01-03', '2026-01-05', '2026-01-07', '2026-01-09']);
  });

  it('expands weekly', () => {
    const dates = expandRepeat('2026-01-01', repeat({ freq: 'weekly' }), '2026-01-01', '2026-01-22');
    expect(dates).toEqual(['2026-01-08', '2026-01-15', '2026-01-22']);
  });

  it('expands monthly, clamping at month end (31st -> short months)', () => {
    const dates = expandRepeat('2026-01-31', repeat({ freq: 'monthly' }), '2026-01-31', '2026-06-30');
    // JS Date rolls Jan 31 + 1 month into Mar 3 (Feb has 28 days in 2026) — document actual behavior.
    expect(dates).toContain('2026-03-03');
  });

  it('expands yearly from a leap day, and never lands back on Feb 29 (JS Date drift)', () => {
    const dates = expandRepeat('2028-02-29', repeat({ freq: 'yearly' }), '2028-02-29', '2032-03-01');
    // 2029 isn't a leap year, so JS rolls Feb 29 + 1yr into Mar 1 — and every subsequent
    // yearly step continues from that drifted March 1, so it never returns to Feb 29
    // even in a later leap year (2032). Documents the actual (surprising) behavior.
    expect(dates).toEqual(['2029-03-01', '2030-03-01', '2031-03-01', '2032-03-01']);
  });

  it('honors endKind: count', () => {
    const dates = expandRepeat('2026-01-01', repeat({ endKind: 'count', count: 3 }), '2026-01-01', '2026-12-31');
    // count includes the base date itself, so only 2 more occurrences follow.
    expect(dates).toEqual(['2026-01-02', '2026-01-03']);
  });

  it('honors endKind: until', () => {
    const dates = expandRepeat('2026-01-01', repeat({ endKind: 'until', until: '2026-01-04' }), '2026-01-01', '2026-12-31');
    expect(dates).toEqual(['2026-01-02', '2026-01-03', '2026-01-04']);
  });

  it('skips exceptions but they still count toward endKind: count', () => {
    const dates = expandRepeat(
      '2026-01-01',
      repeat({ endKind: 'count', count: 5, exceptions: ['2026-01-03'] }),
      '2026-01-01',
      '2026-12-31'
    );
    // Occurrences generated: 01,02,03,04,05 (5 total). 03 is an exception and dropped from
    // the *output*, but still consumed one of the 5 counted occurrences.
    expect(dates).toEqual(['2026-01-02', '2026-01-04', '2026-01-05']);
  });

  it('clips to the requested range', () => {
    const dates = expandRepeat('2026-01-01', repeat({}), '2026-01-05', '2026-01-07');
    expect(dates).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
  });
});

describe('isOccurrenceSkipped', () => {
  it('is true only for a date in exceptions', () => {
    const r = repeat({ exceptions: ['2026-01-05'] });
    expect(isOccurrenceSkipped(r, '2026-01-05')).toBe(true);
    expect(isOccurrenceSkipped(r, '2026-01-06')).toBe(false);
  });

  it('is false for a null repeat', () => {
    expect(isOccurrenceSkipped(null, '2026-01-05')).toBe(false);
  });
});

describe('withException', () => {
  it('adds a date to exceptions, sorted', () => {
    const r = repeat({ exceptions: ['2026-01-10'] });
    const out = withException(r, '2026-01-05');
    expect(out.exceptions).toEqual(['2026-01-05', '2026-01-10']);
  });

  it('is idempotent for an already-excepted date', () => {
    const r = repeat({ exceptions: ['2026-01-05'] });
    const out = withException(r, '2026-01-05');
    expect(out).toBe(r);
  });
});

describe('endedBefore', () => {
  it('sets endKind to until, the day before the given date, and clears count', () => {
    const r = repeat({ endKind: 'count', count: 10 });
    const out = endedBefore(r, '2026-01-10');
    expect(out).toMatchObject({ endKind: 'until', until: '2026-01-09', count: null });
  });
});

describe('tailOf', () => {
  it('carries the remaining count forward for a count-limited series', () => {
    // 5 total occurrences from 2026-01-01 daily; splitting at 2026-01-04 means 3 already
    // happened (01, 02, 03), so the new tail series should have 2 remaining.
    const r = repeat({ endKind: 'count', count: 5 });
    const out = tailOf('2026-01-01', r, '2026-01-04');
    expect(out.count).toBe(2);
  });

  it('leaves a forever series alone (count stays null)', () => {
    const r = repeat({});
    const out = tailOf('2026-01-01', r, '2026-01-04');
    expect(out.count).toBeNull();
  });

  it('keeps only exceptions on/after the split date', () => {
    const r = repeat({ exceptions: ['2026-01-02', '2026-01-06'] });
    const out = tailOf('2026-01-01', r, '2026-01-04');
    expect(out.exceptions).toEqual(['2026-01-06']);
  });
});
