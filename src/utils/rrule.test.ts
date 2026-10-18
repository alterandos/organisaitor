import { describe, expect, it } from 'vitest';
import { icalDate, parseRecurrence, parseRRule } from '@/utils/rrule';

const Z = 'Australia/Sydney';

describe('parseRRule', () => {
  it('reads plain rules with an interval, count or end date', () => {
    expect(parseRRule('FREQ=DAILY', '2026-10-19', Z)).toEqual({ freq: 'daily', interval: 1, endKind: 'forever', count: null, until: null });
    expect(parseRRule('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=5', '2026-10-19', Z)).toMatchObject({ freq: 'weekly', interval: 2, endKind: 'count', count: 5 });
    expect(parseRRule('FREQ=MONTHLY;UNTIL=20270101', '2026-10-19', Z)).toMatchObject({ endKind: 'until', until: '2027-01-01' });
  });

  it('moves a UTC UNTIL into the account zone', () => {
    // 2026-12-31 22:00 UTC is already 1 January in Sydney.
    expect(parseRRule('FREQ=WEEKLY;UNTIL=20261231T220000Z', '2026-10-19', Z)).toMatchObject({ until: '2027-01-01' });
  });

  it('reads weekdays, and "every weekday" written as a daily rule', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-10-19', Z)).toMatchObject({ freq: 'weekly', daysOfWeek: [1, 3, 5] });
    expect(parseRRule('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR', '2026-10-19', Z)).toMatchObject({ freq: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] });
    // Only the start's own weekday: a plain weekly rule.
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO;WKST=SU', '2026-10-19', Z)).not.toHaveProperty('daysOfWeek');
  });

  it('reads the nth weekday of the month, both ways iCalendar writes it', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=2TU', '2026-10-13', Z)).toMatchObject({ monthWeekday: { week: 2, day: 2 } });
    expect(parseRRule('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1', '2026-10-30', Z)).toMatchObject({ monthWeekday: { week: -1, day: 5 } });
    expect(parseRRule('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH', '2026-11-26', Z)).toMatchObject({ freq: 'yearly', monthWeekday: { week: 4, day: 4 } });
  });

  it('accepts BYMONTHDAY / BYMONTH that restate the start date', () => {
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=19', '2026-10-19', Z)).toMatchObject({ freq: 'monthly' });
    expect(parseRRule('FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=19', '2026-10-19', Z)).toMatchObject({ freq: 'yearly' });
  });

  it('refuses what the app cannot show exactly', () => {
    for (const rule of [
      'FREQ=HOURLY',
      'FREQ=MONTHLY;BYMONTHDAY=1,15',
      'FREQ=MONTHLY;BYDAY=MO,TU',
      'FREQ=MONTHLY;BYDAY=-2FR',
      'FREQ=YEARLY;BYMONTH=1,7',
      'FREQ=WEEKLY;BYDAY=1MO',
      'FREQ=DAILY;INTERVAL=2;BYDAY=MO,FR',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;WKST=SU',
      'FREQ=DAILY;BYHOUR=9',
    ]) expect(parseRRule(rule, '2026-10-19', Z), rule).toBeNull();
  });
});

describe('parseRecurrence', () => {
  it('turns EXDATEs into the series exceptions', () => {
    expect(parseRecurrence(['RRULE:FREQ=WEEKLY', 'EXDATE;TZID=Australia/Sydney:20261026T090000,20261102T090000'], '2026-10-19', Z))
      .toMatchObject({ freq: 'weekly', exceptions: ['2026-10-26', '2026-11-02'] });
  });

  it('refuses RDATE and a second rule', () => {
    expect(parseRecurrence(['RRULE:FREQ=WEEKLY', 'RDATE:20261030'], '2026-10-19', Z)).toBeNull();
    expect(parseRecurrence(['RRULE:FREQ=WEEKLY', 'RRULE:FREQ=DAILY'], '2026-10-19', Z)).toBeNull();
  });
});

describe('icalDate', () => {
  it('reads dates and local times as they are, and UTC times in the zone', () => {
    expect(icalDate('20261019', Z)).toBe('2026-10-19');
    expect(icalDate('20261019T230000', Z)).toBe('2026-10-19');
    expect(icalDate('20261019T230000Z', Z)).toBe('2026-10-20');
  });
});
