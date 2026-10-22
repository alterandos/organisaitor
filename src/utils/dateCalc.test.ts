import { describe, expect, it } from 'vitest';
import { between, countFrom, readDateCalc } from './dateCalc';

// The date calculator's rules and its magic wand's reading (utils/dateCalc.ts).

const NOW = new Date(2026, 9, 23, 9, 0);   // Friday 23 October 2026
const TODAY = '2026-10-23';
const read = (text: string) => readDateCalc(text, NOW, TODAY);

describe('counting from a date', () => {
  it('days, weeks, months (keeping to the month’s last day) and years, on or back', () => {
    expect(countFrom('2026-10-22', 90, 'days', 1)).toBe('2027-01-20');
    expect(countFrom('2026-10-23', 3, 'weeks', -1)).toBe('2026-10-02');
    expect(countFrom('2027-01-31', 1, 'months', 1)).toBe('2027-02-28');
    expect(countFrom('2028-02-29', 1, 'years', 1)).toBe('2029-02-28');
  });

  it('a weekday counts from the day after, so the 12th Friday from Thursday 1 October 2026 is 18 December', () => {
    expect(countFrom('2026-10-01', 12, 'dow5', 1)).toBe('2026-12-18');
    expect(countFrom('2026-10-02', 1, 'dow5', 1)).toBe('2026-10-09');
    expect(countFrom('2026-10-23', 1, 'dow1', -1)).toBe('2026-10-19');
  });

  it('working days skip weekends', () => {
    expect(countFrom('2026-10-23', 1, 'workdays', 1)).toBe('2026-10-26');
    expect(countFrom('2026-10-26', 5, 'workdays', -1)).toBe('2026-10-19');
  });
});

describe('between two dates', () => {
  it('days, weeks and the rest, and working days; negative when the second is earlier', () => {
    expect(between('2026-10-23', '2026-11-06')).toEqual({ days: 14, weeks: 2, rest: 0, workdays: 10 });
    expect(between('2026-11-06', '2026-10-23').days).toBe(-14);
    expect(between('2026-11-06', '2026-10-23').workdays).toBe(-10);
  });
});

describe('the magic wand reads a question', () => {
  it.each([
    ['the 12th Friday from 1 October 2026', { kind: 'count', from: '2026-10-01', n: 12, unit: 'dow5', dir: 1 }],
    ['90 days from yesterday', { kind: 'count', from: '2026-10-22', n: 90, unit: 'days', dir: 1 }],
    ['3 weeks before 25 December 2026', { kind: 'count', from: '2026-12-25', n: 3, unit: 'weeks', dir: -1 }],
    ['10 working days after today', { kind: 'count', from: TODAY, n: 10, unit: 'workdays', dir: 1 }],
    ['What is the date 2 months ago?', { kind: 'count', from: TODAY, n: 2, unit: 'months', dir: -1 }],
    ['in 6 weeks', { kind: 'count', from: TODAY, n: 6, unit: 'weeks', dir: 1 }],
    ['a fortnight from now', { kind: 'count', from: TODAY, n: 2, unit: 'weeks', dir: 1 }],
    ['next Monday after 1 March 2027', { kind: 'count', from: '2027-03-01', n: 1, unit: 'dow1', dir: 1 }],
    ['how many days between 1 January 2027 and 1 March 2027', { kind: 'between', from: '2027-01-01', to: '2027-03-01' }],
    ['from 3 May 2027 to 9 June 2027', { kind: 'between', from: '2027-05-03', to: '2027-06-09' }],
    ['how many days until 25 December 2026?', { kind: 'between', from: TODAY, to: '2026-12-25' }],
    ['days since 1 January 2026', { kind: 'between', from: '2026-01-01', to: TODAY }],
  ])('%s', (text, expected) => expect(read(text)).toEqual(expected));

  it('nothing it can read gives nothing', () => {
    expect(read('buy milk')).toBeNull();
    expect(read('3 bananas from the shop')).toBeNull();
  });
});
