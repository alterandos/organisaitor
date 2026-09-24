import { describe, expect, it } from 'vitest';
import { inferCalendarItemFromSelection, inferTaskFromSelection } from '@/utils/textToTask';

// Mirrors the day-first/month-first detection textToTask.ts uses internally (Intl-based,
// not hardcoded), so these tests stay correct on any machine/CI locale rather than assuming one.
function isDayFirstLocale(): boolean {
  const parts = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(2020, 0, 2));
  const dayIdx = parts.findIndex((p) => p.type === 'day');
  const monthIdx = parts.findIndex((p) => p.type === 'month');
  return dayIdx >= 0 && monthIdx >= 0 && dayIdx < monthIdx;
}
const dayFirst = isDayFirstLocale();

const TODAY = new Date(2026, 8, 24); // 2026-09-24 (month is 0-based)

describe('inferTaskFromSelection — dates', () => {
  it('relative words: today/tomorrow', () => {
    expect(inferTaskFromSelection('Submit report today', TODAY).deadline).toBe('2026-09-24');
    expect(inferTaskFromSelection('Submit report tomorrow', TODAY).deadline).toBe('2026-09-25');
  });

  it('ISO date', () => {
    expect(inferTaskFromSelection('Due 2027-01-05', TODAY).deadline).toBe('2027-01-05');
  });

  it('"Month Day, Year" and "Month Day" (year defaults to the reference year)', () => {
    expect(inferTaskFromSelection('Report due March 5th, 2027', TODAY).deadline).toBe('2027-03-05');
    expect(inferTaskFromSelection('Report due December 3rd', TODAY).deadline).toBe('2026-12-03');
  });

  it('"Day of Month, Year"', () => {
    expect(inferTaskFromSelection('Due 5th of March, 2027', TODAY).deadline).toBe('2027-03-05');
  });

  it('numeric D/M/Y — unambiguous parts resolve regardless of locale', () => {
    // 25 can't be a month, so it's unambiguously the day
    expect(inferTaskFromSelection('Due 25/03/2027', TODAY).deadline).toBe('2027-03-25');
  });

  it('numeric D/M without a year, ambiguous both <=12, is skipped entirely (too risky to guess)', () => {
    expect(inferTaskFromSelection('Due 3/4', TODAY).deadline).toBeNull();
  });

  it('numeric D/M without a year, but unambiguous, resolves without needing a year', () => {
    // 15 can't be a month, so "15/3" unambiguously means day 15, month 3, in whichever
    // position the slash pattern puts it.
    expect(inferTaskFromSelection('Due 15/3', TODAY).deadline).toBe('2027-03-15');
  });

  it('bare "10-15" (dash, no year, 2 numbers) is NOT parsed as a date', () => {
    expect(inferTaskFromSelection('Read pages 10-15 tonight', TODAY).deadline).toBe('2026-09-24'); // "tonight" wins, not 10-15
    expect(inferTaskFromSelection('Read pages 10-15', TODAY).deadline).toBeNull();
  });

  it('bare "3.14" is NOT parsed as a date', () => {
    expect(inferTaskFromSelection('Remember the value 3.14 exactly', TODAY).deadline).toBeNull();
  });

  it('"11-09-2029" (dash, with year) IS parsed as a date, per locale day/month order', () => {
    const out = inferTaskFromSelection('Renew by 11-09-2029', TODAY).deadline;
    expect(out).toBe(dayFirst ? '2029-09-11' : '2029-11-09');
  });

  it('year rollover: a date without a year that has already passed this year rolls to next year', () => {
    // TODAY is Sep 24 2026; "March 5" without a year has already passed -> rolls to 2027.
    expect(inferTaskFromSelection('Due March 5', TODAY).deadline).toBe('2027-03-05');
    // "November 3" without a year is still ahead this year -> stays 2026.
    expect(inferTaskFromSelection('Due November 3', TODAY).deadline).toBe('2026-11-03');
  });

  it('an explicit past year is kept as-is, not rolled forward', () => {
    expect(inferTaskFromSelection('Happened on March 5, 2020', TODAY).deadline).toBe('2020-03-05');
  });
});

describe('inferTaskFromSelection — times', () => {
  it('12-hour with am/pm', () => {
    expect(inferTaskFromSelection('Call at 6pm tomorrow', TODAY).deadlineTime).toBe('18:00');
  });

  it('24-hour HH:MM', () => {
    expect(inferTaskFromSelection('Call at 18:00 tomorrow', TODAY).deadlineTime).toBe('18:00');
  });

  it('noon and midnight', () => {
    expect(inferTaskFromSelection('Lunch at noon tomorrow', TODAY).deadlineTime).toBe('12:00');
    expect(inferTaskFromSelection('Deploy at midnight tomorrow', TODAY).deadlineTime).toBe('00:00');
  });

  it('a time is only extracted alongside a date', () => {
    expect(inferTaskFromSelection('Meet at 6pm', TODAY).deadlineTime).toBeNull();
  });
});

describe('inferTaskFromSelection — priority', () => {
  it('urgent/asap are strong standalone signals for high', () => {
    expect(inferTaskFromSelection('This is urgent').priority).toBe('high');
    expect(inferTaskFromSelection('asap please').priority).toBe('high');
    expect(inferTaskFromSelection('Fix this!!').priority).toBe('high');
  });

  it('low priority phrases', () => {
    expect(inferTaskFromSelection('no rush on this').priority).toBe('low');
  });

  it('"medium" alone does not fire without explicit priority context', () => {
    expect(inferTaskFromSelection('a medium-sized task').priority).toBeNull();
    expect(inferTaskFromSelection('medium priority task').priority).toBe('medium');
  });

  it('no signal returns null', () => {
    expect(inferTaskFromSelection('Buy milk').priority).toBeNull();
  });
});

describe('inferTaskFromSelection — links and title cleanup', () => {
  it('extracts URLs into links', () => {
    expect(inferTaskFromSelection('See https://example.com/doc for details').links).toEqual(['https://example.com/doc']);
  });

  it('strips date/time/link spans and their connector words from the title', () => {
    const out = inferTaskFromSelection('The report is due on 2026-10-02', TODAY);
    expect(out.title).toBe('The report is due');
    expect(out.deadline).toBe('2026-10-02');
  });

  it('falls back to the original text if nothing meaningful remains', () => {
    const out = inferTaskFromSelection('2026-10-02', TODAY);
    expect(out.title.length).toBeGreaterThan(0);
  });

  it('removes a link from the title text', () => {
    const out = inferTaskFromSelection('Read https://example.com/article before Friday', TODAY);
    expect(out.title).not.toContain('https://');
  });
});

describe('inferCalendarItemFromSelection', () => {
  it('classifies a time range as an event', () => {
    const out = inferCalendarItemFromSelection('Team sync 2pm-3pm tomorrow', [], TODAY);
    expect(out.kind).toBe('event');
    expect(out.startTime).toBe('14:00');
    expect(out.endTime).toBe('15:00');
  });

  it('parses "2-3pm" (shared meridiem)', () => {
    const out = inferCalendarItemFromSelection('Standup 2-3pm', [], TODAY);
    expect(out.startTime).toBe('14:00');
    expect(out.endTime).toBe('15:00');
  });

  it('parses "14:00 to 15:30"', () => {
    const out = inferCalendarItemFromSelection('Workshop 14:00 to 15:30', [], TODAY);
    expect(out.startTime).toBe('14:00');
    expect(out.endTime).toBe('15:30');
  });

  it('"10-15" alone is not treated as a time range or date', () => {
    const out = inferCalendarItemFromSelection('Review pages 10-15', [], TODAY);
    expect(out.startTime).toBeNull();
    expect(out.endTime).toBeNull();
    expect(out.date).toBeNull();
  });

  it('an event-shaped word (no range) still classifies as an event', () => {
    expect(inferCalendarItemFromSelection('Dentist appointment tomorrow', [], TODAY).kind).toBe('event');
  });

  it('anything else classifies as a reminder', () => {
    expect(inferCalendarItemFromSelection('Pay rent tomorrow', [], TODAY).kind).toBe('reminder');
  });

  it('puts the first link into location for an event, the rest into notes', () => {
    const out = inferCalendarItemFromSelection('Meeting https://a.example https://b.example', [], TODAY);
    expect(out.location).toBe('https://a.example');
    expect(out.notes).toBe('https://b.example');
  });

  it('merges extraLinks with links found in the text, de-duplicated', () => {
    const out = inferCalendarItemFromSelection('Call https://a.example', ['https://a.example', 'https://c.example'], TODAY);
    const all = [out.location, ...(out.notes ? out.notes.split('\n') : [])].filter(Boolean);
    expect(new Set(all)).toEqual(new Set(['https://a.example', 'https://c.example']));
  });
});
