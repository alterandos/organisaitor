import type { TravelMode } from '@/types';

// What kind of thing an imported event is, read from its title (and, for Google, its own event
// type). Shared by Google sync and the .ics import, so both see birthdays and journeys alike.

// "Jane Doe's birthday", "Birthday: Jane", "Sam's bday 🎂".
export function looksLikeBirthday(title: string): boolean {
  return /\b(birthday|bday|b-day)\b/i.test(title) || /🎂/.test(title);
}

// The person a birthday is for, as a comparable name: "Jane Doe's Birthday" and "Birthday: jane
// doe" are both "jane doe".
export function birthdayName(title: string): string {
  return title
    .replace(/[🎂🎉🥳🎈]/gu, ' ')
    .replace(/\b(happy|birthday|bday|b-day)\b/gi, ' ')
    .replace(/['’]s\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

// The same person's birthday from two places (Google's Birthdays calendar, an event someone made
// by hand, an .ics file) has the same key, so it's only ever one event.
export function birthdayKey(title: string, date: string): string {
  return `${birthdayName(title) || title.trim().toLowerCase()}|${date.slice(5)}`;
}

// A journey's mode from its title. Google's own reservations (eventType 'fromGmail': "Flight to
// London (BA 15)", "Train to Paris") are read freely; any other event only when the title starts
// with the mode and says where to or from, so "Train the new starter" stays a plain event.
const MODES: [RegExp, TravelMode][] = [
  [/flight|flying|✈/i, 'flight'],
  [/train|rail|🚆/i, 'train'],
  [/\bbus\b|coach|🚌/i, 'bus'],
  [/ferry|⛴/i, 'ferry'],
  [/\bdrive\b|driving|road trip/i, 'car'],
];

export function travelModeFromTitle(title: string, fromReservation: boolean): TravelMode | null {
  const t = title.trim();
  if (fromReservation) {
    for (const [re, mode] of MODES) if (re.test(t)) return mode;
    return null;
  }
  const m = t.match(/^(?:✈️?|🚆|🚌|⛴️?)?\s*(flight|train|bus|coach|ferry|drive)\s+(to|from|back to|home)\b/i)
    ?? t.match(/^(✈️?|🚆|🚌|⛴️?)\s/u);
  if (!m) return null;
  for (const [re, mode] of MODES) if (re.test(m[0])) return mode;
  return null;
}
