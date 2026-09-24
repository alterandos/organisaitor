import { describe, expect, it } from 'vitest';
import { looksLikeBirthday, parseICS } from '@/utils/icsParser';

function ics(...events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
}

describe('parseICS', () => {
  it('parses a simple timed event with a trailing Z (UTC)', () => {
    const raw = ics(
      'BEGIN:VEVENT',
      'SUMMARY:Team sync',
      'DTSTART:20260315T140000Z',
      'DTEND:20260315T150000Z',
      'LOCATION:Room 4',
      'END:VEVENT'
    );
    const [ev] = parseICS(raw);
    expect(ev).toMatchObject({
      title: 'Team sync',
      date: '2026-03-15',
      startTime: '14:00',
      endTime: '15:00',
      location: 'Room 4',
      tzid: 'UTC',
    });
  });

  it('parses an all-day event (VALUE=DATE)', () => {
    const raw = ics('BEGIN:VEVENT', 'SUMMARY:Conference', 'DTSTART;VALUE=DATE:20260401', 'END:VEVENT');
    const [ev] = parseICS(raw);
    expect(ev).toMatchObject({ date: '2026-04-01', startTime: null, tzid: null });
  });

  it('preserves TZID parameter case exactly (must not be uppercased to AMERICA/NEW_YORK)', () => {
    const raw = ics(
      'BEGIN:VEVENT',
      'SUMMARY:Standup',
      'DTSTART;TZID=America/New_York:20260315T090000',
      'END:VEVENT'
    );
    const [ev] = parseICS(raw);
    expect(ev.tzid).toBe('America/New_York');
    expect(ev.startTime).toBe('09:00');
  });

  it('treats a value with no Z and no TZID as floating time (tzid: null)', () => {
    const raw = ics('BEGIN:VEVENT', 'SUMMARY:Floating', 'DTSTART:20260315T090000', 'END:VEVENT');
    const [ev] = parseICS(raw);
    expect(ev.tzid).toBeNull();
    expect(ev.startTime).toBe('09:00');
  });

  it('expands a weekly RRULE, honoring EXDATE', () => {
    const raw = ics(
      'BEGIN:VEVENT',
      'SUMMARY:Standup',
      'DTSTART:20260302T090000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'EXDATE:20260309T090000Z',
      'END:VEVENT'
    );
    const events = parseICS(raw);
    expect(events.map((e) => e.date)).toEqual(['2026-03-02', '2026-03-16', '2026-03-23']);
  });

  it('handles folded lines (CRLF + leading space/tab join, per RFC 5545 the fold\'s own leading space is consumed)', () => {
    const raw = ics(
      'BEGIN:VEVENT',
      'SUMMARY:A very long title that got \r\n folded across two lines',
      'DTSTART:20260315T090000Z',
      'END:VEVENT'
    );
    const [ev] = parseICS(raw);
    expect(ev.title).toBe('A very long title that got folded across two lines');
  });

  it('unescapes commas, semicolons, backslashes and newlines in text fields', () => {
    const raw = ics(
      'BEGIN:VEVENT',
      'SUMMARY:Launch\\, party',
      'DESCRIPTION:Line one\\nLine two\\; still one field',
      'DTSTART:20260315T090000Z',
      'END:VEVENT'
    );
    const [ev] = parseICS(raw);
    expect(ev.title).toBe('Launch, party');
    expect(ev.notes).toBe('Line one\nLine two; still one field');
  });

  it('ignores an event with no SUMMARY or no DTSTART', () => {
    const raw = ics('BEGIN:VEVENT', 'DTSTART:20260315T090000Z', 'END:VEVENT');
    expect(parseICS(raw)).toEqual([]);
  });

  it('parses multiple independent events', () => {
    const raw = ics(
      'BEGIN:VEVENT', 'SUMMARY:One', 'DTSTART:20260301T090000Z', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Two', 'DTSTART:20260302T090000Z', 'END:VEVENT'
    );
    expect(parseICS(raw).map((e) => e.title)).toEqual(['One', 'Two']);
  });
});

describe('looksLikeBirthday', () => {
  it('recognizes common birthday export title shapes', () => {
    expect(looksLikeBirthday("Jane Doe's Birthday")).toBe(true);
    expect(looksLikeBirthday('Birthday: Jane Doe')).toBe(true);
  });

  it('is false for an unrelated title', () => {
    expect(looksLikeBirthday('Team sync')).toBe(false);
  });
});
