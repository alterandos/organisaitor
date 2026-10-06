import { inferCalendarItemFromSelection } from '@/utils/textToTask';
import { addDaysToIso, computeLinkedEndTime } from '@/utils/date';

const DAY_NAMES: Record<string, string> = {
  mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', thu: 'thursday', thur: 'thursday',
  thurs: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday',
};

// What a person typed into a date or time box (the `\` preview's fields, a pane's date/time),
// read with the same parser as `\` and Ctrl+Q. A box holds only a date, so a short weekday ("fri",
// "next sat") is safe to read as one here — unlike in prose, where "sat" and "wed" are words, which
// is why the shared parser doesn't. A range ("1-2pm") gives both times.
export function readWhenInput(raw: string, now: Date = new Date()): { date: string | null; time: string | null; endTime: string | null } {
  const text = raw.trim().replace(/^((?:next|this|on)\s+)?([a-z]+)\b/i, (whole, lead: string | undefined, word: string) => {
    const day = DAY_NAMES[word.toLowerCase()];
    return day ? `${lead ?? ''}${day}` : whole;
  });
  const read = inferCalendarItemFromSelection(text, [], now);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  return { date: read.date ?? iso, time: read.startTime, endTime: read.endTime };
}

// What's typed after `\reminder` / `\event`: a short weekday counts where it can only be a day —
// before a time ("fri 1-2pm"), after on/next/this/by/until ("by tue"), or as the last word
// ("call mum sat") — so "sat down with Sam" keeps its verb.
export function expandShortWeekdays(text: string): string {
  return text.replace(/\b(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\b(?=\s*(\d|$))|(\b(?:on|next|this|by|until)\s+)(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\b/gi,
    (whole, bare: string | undefined, _next: string, lead: string | undefined, afterLead: string | undefined) => {
      const word = (bare ?? afterLead ?? '').toLowerCase();
      const day = DAY_NAMES[word];
      if (!day) return whole;
      return lead ? `${lead}${day}` : day;
    });
}

// A title read from what's typed after `\`: a trailing "important" / "urgent" / "asap" there can
// only be the flag (which the parser has already set), so it comes off the title. The shared
// parser keeps it, on purpose, for prose selected with Ctrl+Q ("this is important").
export const tidyObjectTitle = (title: string): string =>
  title.replace(/[\s,;:–-]+(?:important|urgent|asap)\s*!*\s*$/i, '').trim() || title;

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// An object created with `\` that says nothing about when: tomorrow at midday (decided by the user,
// 2026-10-06). Saying only a date still means a whole day; only a time, today.
export const DEFAULT_OBJECT_TIME = '12:00';
export const defaultObjectDate = (now: Date) => addDaysToIso(isoOf(now), 1);

// An event's end when only its start is known: an hour later (the Add Calendar Item rule), or none
// if that would cross midnight.
export function endAfter(start: string): string | null {
  const { time, dayOffset } = computeLinkedEndTime(start, '');
  return dayOffset > 0 ? null : time;
}
