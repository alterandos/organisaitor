import { describe, expect, it } from 'vitest';
import { readTimeline, readTimelineWhen, type WhenPoint } from './timelineWhen';

const NOW = new Date(2026, 9, 7);
const read = (s: string, dayFirst = true) => readTimelineWhen(s, dayFirst, NOW);
const pt = (year: number | null, month: number | null = null, day: number | null = null, minutes: number | null = null): WhenPoint =>
  ({ year, month, day, minutes });
const date = (p: WhenPoint) => ({ scale: 'date', point: p });

describe('readTimelineWhen', () => {
  it('reads full dates in many formats', () => {
    expect(read('01/02/1990')).toEqual(date(pt(1990, 1, 1)));              // day first here
    expect(read('01/02/1990', false)).toEqual(date(pt(1990, 0, 2)));       // month first in the US
    expect(read('25/12/1990', false)).toEqual(date(pt(1990, 11, 25)));     // unambiguous either way
    expect(read('1990-01-31')).toEqual(date(pt(1990, 0, 31)));
    expect(read('1.2.90')).toEqual(date(pt(1990, 1, 1)));
    expect(read('28 June 1914')).toEqual(date(pt(1914, 5, 28)));
    expect(read('1st of January, 1990')).toEqual(date(pt(1990, 0, 1)));
    expect(read('January 1, 1990')).toEqual(date(pt(1990, 0, 1)));
    expect(read('Sept 3rd 1939')).toEqual(date(pt(1939, 8, 3)));
  });

  it('reads partial dates', () => {
    expect(read('1990')).toEqual(date(pt(1990)));
    expect(read('January 1990')).toEqual(date(pt(1990, 0)));
    expect(read("Jan '90")).toEqual(date(pt(1990, 0)));
    expect(read('1990-03')).toEqual(date(pt(1990, 2)));
    expect(read('28 June')).toEqual(date(pt(null, 5, 28)));
    expect(read('June')).toEqual(date(pt(null, 5)));
    expect(read('Q3 2024')).toEqual(date(pt(2024, 6)));
    expect(read('2024 Q3')).toEqual(date(pt(2024, 6)));
    expect(read('H2 2024')).toEqual(date(pt(2024, 6)));
    expect(read('Summer 1969')).toEqual(date(pt(1969, 5)));
  });

  it('reads eras, approximations, decades, centuries and ranges', () => {
    expect(read('c. 1200 BC')).toEqual(date(pt(-1200)));
    expect(read('44 B.C.')).toEqual(date(pt(-44)));
    expect(read('AD 79')).toEqual(date(pt(79)));
    expect(read('33 CE')).toEqual(date(pt(33)));
    expect(read('Room 79')).toBeNull();   // a short number with no era isn't a year
    expect(read('the 1990s')).toEqual(date(pt(1990)));
    expect(read("late '60s")).toEqual(date(pt(1968)));
    expect(read('1800s')).toEqual(date(pt(1800)));
    expect(read('19th century')).toEqual(date(pt(1800)));
    expect(read('1914–1918')).toEqual(date(pt(1914)));
    expect(read('1914-18')).toEqual(date(pt(1914)));
    expect(read('June – July 1914')).toEqual(date(pt(1914, 5)));
    expect(read('500–400 BC')).toEqual(date(pt(-500)));
  });

  it('reads times, alone or with a date', () => {
    expect(read('9:30am')).toEqual(date(pt(null, null, null, 570)));
    expect(read('14:05')).toEqual(date(pt(null, null, null, 845)));
    expect(read('3 May 2026, 5pm')).toEqual(date(pt(2026, 4, 3, 1020)));
    expect(read('noon')).toEqual(date(pt(null, null, null, 720)));
  });

  it('reads counted steps, and nothing from text that has no when', () => {
    expect(read('Day 3')).toEqual({ scale: 'step:day', value: 3 });
    expect(read('Week 12: wrap-up')).toEqual({ scale: 'step:week', value: 12 });
    expect(read('Phase 2')).toEqual({ scale: 'step:phase', value: 2 });
    expect(read('')).toBeNull();
    expect(read('Background')).toBeNull();
    expect(read('3')).toBeNull();
  });
});

describe('readTimeline', () => {
  const order = (whens: string[], dir: 'asc' | 'desc' | 'manual' = 'asc') => readTimeline(whens, dir, true, NOW).order.map((i) => whens[i]);

  it('sorts by date, across formats', () => {
    expect(order(['1918', '28 June 1914', 'January 1915', '1914-08-04'])).toEqual(['28 June 1914', '1914-08-04', 'January 1915', '1918']);
    expect(order(['1918', '28 June 1914', 'January 1915'], 'desc')).toEqual(['1918', 'January 1915', '28 June 1914']);
    expect(order(['1918', '28 June 1914'], 'manual')).toEqual(['1918', '28 June 1914']);
  });

  it('a When without a year takes it from the dated entry before it, and says so', () => {
    const whens = ['28 June 1914', '4 August', '23 July'];
    const r = readTimeline(whens, 'asc', true, NOW);
    expect(r.order.map((i) => whens[i])).toEqual(['28 June 1914', '23 July', '4 August']);
    expect(r.inferredYear).toEqual([null, 1914, 1914]);
  });

  it('BC sorts before AD; times sort within their day', () => {
    expect(order(['33 AD', '500 BC', 'c. 1200 BC'])).toEqual(['c. 1200 BC', '500 BC', '33 AD']);
    expect(order(['3 May 2026', '5pm', '9am'])).toEqual(['3 May 2026', '9am', '5pm']);
  });

  it('keeps entries it can’t place next to the one before them, and undated leading entries first', () => {
    expect(order(['Background', '1990', 'Notes on 1990', '1980'])).toEqual(['Background', '1980', '1990', 'Notes on 1990']);
    expect(order(['1990', '', '1980'])).toEqual(['1980', '1990', '']);
  });

  it('uses the scale most entries use (steps), and keeps the order of equal dates', () => {
    expect(order(['Day 3', 'Day 1', 'Day 2', '1990'])).toEqual(['Day 1', 'Day 2', '1990', 'Day 3']);
    expect(order(['1990 (a)', '1990 (b)', '1980'])).toEqual(['1980', '1990 (a)', '1990 (b)']);
  });
});
