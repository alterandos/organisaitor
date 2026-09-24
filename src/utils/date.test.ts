import { describe, expect, it } from 'vitest';
import { addDaysToIso, computeLinkedEndTime, timeAddMinutes } from '@/utils/date';

describe('computeLinkedEndTime', () => {
  it('defaults to start + 60 minutes when there is no end time yet', () => {
    expect(computeLinkedEndTime('14:00', '')).toEqual({ time: '15:00', dayOffset: 0 });
  });

  it('keeps existing minutes and only nudges the hour when the end is already after the start', () => {
    expect(computeLinkedEndTime('14:00', '16:45')).toEqual({ time: '16:45', dayOffset: 0 });
  });

  it('nudges the hour forward, preserving minutes, when the end is now before/equal the new start', () => {
    // end was 09:15, start moved to 10:00 -> same-hour combo (10:15) is still after start, keep hour 10
    expect(computeLinkedEndTime('10:00', '09:15')).toEqual({ time: '10:15', dayOffset: 0 });
  });

  it('bumps the hour by one more when even the same-hour combo is not after start', () => {
    // end was 09:00, start moved to 09:00 -> 09:00 is not after 09:00, needs +1 hour
    expect(computeLinkedEndTime('09:00', '09:00')).toEqual({ time: '10:00', dayOffset: 0 });
  });

  it('wraps past midnight and reports dayOffset: 1', () => {
    expect(computeLinkedEndTime('23:30', '')).toEqual({ time: '00:30', dayOffset: 1 });
  });

  it('wraps past midnight when nudging the hour forward too', () => {
    expect(computeLinkedEndTime('23:45', '23:30')).toEqual({ time: '00:30', dayOffset: 1 });
  });
});

describe('timeAddMinutes', () => {
  it('adds minutes within a day', () => {
    expect(timeAddMinutes('10:00', 90)).toBe('11:30');
  });

  it('clamps at 00:00 rather than wrapping to the previous day', () => {
    expect(timeAddMinutes('00:10', -30)).toBe('00:00');
  });

  it('clamps at 23:59 rather than wrapping to the next day', () => {
    expect(timeAddMinutes('23:50', 30)).toBe('23:59');
  });
});

describe('addDaysToIso', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysToIso('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('adds days across a year boundary', () => {
    expect(addDaysToIso('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day correctly', () => {
    expect(addDaysToIso('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToIso('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('subtracts days', () => {
    expect(addDaysToIso('2026-03-01', -1)).toBe('2026-02-28');
  });
});
