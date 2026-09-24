import { describe, expect, it } from 'vitest';
import {
  SYSTEM_TIMEZONE,
  listTimezones,
  resolveTimezone,
  zonedTimeToUtc,
  utcToZonedTime,
  rezoneWallClock,
  todayIsoInZone,
} from '@/utils/timezone';

// Zones chosen to cover: no DST (UTC, Asia/Kolkata — also a half-hour offset), US/EU DST
// (opposite hemispheres of the transition calendar), southern-hemisphere DST (Australia),
// and a zone with an unusual offset (Asia/Kathmandu, UTC+5:45).
const ZONES = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin',
  'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'Asia/Kathmandu',
];

describe('zonedTimeToUtc / utcToZonedTime round-trip', () => {
  const dates = ['2026-01-15', '2026-06-15', '2026-03-08', '2026-11-01', '2026-12-31'];

  for (const zone of ZONES) {
    for (const date of dates) {
      it(`round-trips ${date} 14:30 in ${zone}`, () => {
        const instant = zonedTimeToUtc(date, '14:30', zone);
        const back = utcToZonedTime(instant, zone);
        expect(back).toEqual({ date, time: '14:30' });
      });
    }
  }

  it('round-trips across the US spring-forward transition (2026-03-08, America/New_York)', () => {
    const before = zonedTimeToUtc('2026-03-08', '01:30', 'America/New_York');
    const after = zonedTimeToUtc('2026-03-08', '03:30', 'America/New_York');
    // 1:30 AM -> 3:30 AM should be exactly 1 real hour apart (the 2-3am hour doesn't exist)
    expect(after.getTime() - before.getTime()).toBe(60 * 60 * 1000);
  });

  it('round-trips across the US fall-back transition (2026-11-01, America/New_York)', () => {
    const back = utcToZonedTime(zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York'), 'America/New_York');
    expect(back.date).toBe('2026-11-01');
  });

  it('round-trips across the EU spring-forward transition (2026-03-29, Europe/Berlin)', () => {
    const before = zonedTimeToUtc('2026-03-29', '01:30', 'Europe/Berlin');
    const after = zonedTimeToUtc('2026-03-29', '03:30', 'Europe/Berlin');
    expect(after.getTime() - before.getTime()).toBe(60 * 60 * 1000);
  });

  it('round-trips the southern-hemisphere DST transition (Australia/Sydney, 2026-04-05)', () => {
    const instant = zonedTimeToUtc('2026-04-05', '10:00', 'Australia/Sydney');
    expect(utcToZonedTime(instant, 'Australia/Sydney')).toEqual({ date: '2026-04-05', time: '10:00' });
  });

  it('does not overshoot on the second correction pass (diffs against the fixed target)', () => {
    // A regression case for a bug shape where the second pass diffs against the evolving
    // guess instead of the original target and overshoots past the right answer.
    for (const zone of ZONES) {
      const instant = zonedTimeToUtc('2026-07-04', '23:45', zone);
      expect(utcToZonedTime(instant, zone)).toEqual({ date: '2026-07-04', time: '23:45' });
    }
  });
});

describe('resolveTimezone', () => {
  it('returns the explicit zone unchanged', () => {
    expect(resolveTimezone('America/New_York')).toBe('America/New_York');
  });

  it('resolves the system sentinel to the host machine zone', () => {
    expect(resolveTimezone(SYSTEM_TIMEZONE)).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('rezoneWallClock', () => {
  it('re-expresses the same instant in another zone (NY afternoon -> LA morning)', () => {
    const result = rezoneWallClock('2026-06-15', '14:00', 'America/New_York', 'America/Los_Angeles');
    expect(result).toEqual({ date: '2026-06-15', time: '11:00' });
  });

  it('is a no-op when from and to are the same zone', () => {
    expect(rezoneWallClock('2026-06-15', '09:15', 'Asia/Tokyo', 'Asia/Tokyo')).toEqual({ date: '2026-06-15', time: '09:15' });
  });

  it('can shift across a day boundary', () => {
    // 00:30 in Tokyo is the previous afternoon in Los Angeles.
    const result = rezoneWallClock('2026-06-15', '00:30', 'Asia/Tokyo', 'America/Los_Angeles');
    expect(result.date).toBe('2026-06-14');
  });
});

describe('todayIsoInZone', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayIsoInZone('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('can differ between two far-apart zones around a date boundary', () => {
    // Not asserting a specific day (test-run-time dependent) — just that the function
    // agrees with utcToZonedTime(now) for both zones.
    const now = new Date();
    expect(todayIsoInZone('Pacific/Auckland')).toBe(utcToZonedTime(now, 'Pacific/Auckland').date);
    expect(todayIsoInZone('Pacific/Honolulu')).toBe(utcToZonedTime(now, 'Pacific/Honolulu').date);
  });
});

describe('listTimezones', () => {
  it('returns a non-empty list including common zones', () => {
    const zones = listTimezones();
    expect(zones.length).toBeGreaterThan(50);
    expect(zones).toContain('America/New_York');
    expect(zones).toContain('Europe/London');
  });
});
