import { readDate } from '@/utils/textToTask';

// The date calculator (components/DateCalculator), pure: counting on or back from a date, and
// the time between two dates, plus the magic wand's reading of a question in words ("the 12th
// Friday from 1 October 2026", "90 days from yesterday", "how many days until 25 Dec"). Built-in
// rules today; an AI reader can stand in later (BACKLOG.md "AI agent").

// What to count: days, weeks, months, years, working days (Monday to Friday), or one weekday
// ('dow0' Sunday … 'dow6' Saturday: "the 12th Friday").
export type CalcUnit = 'days' | 'weeks' | 'months' | 'years' | 'workdays' | `dow${0 | 1 | 2 | 3 | 4 | 5 | 6}`;
export const CALC_UNITS: CalcUnit[] = ['days', 'weeks', 'months', 'years', 'workdays', 'dow1', 'dow2', 'dow3', 'dow4', 'dow5', 'dow6', 'dow0'];

export type DateCalc =
  | { kind: 'count'; from: string; n: number; unit: CalcUnit; dir: 1 | -1 }
  | { kind: 'between'; from: string; to: string };

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const isWorkday = (s: string) => { const w = utc(s).getUTCDay(); return w !== 0 && w !== 6; };

// Counting on (dir 1) or back (-1). The start date itself never counts for working days or a
// weekday ("the 1st Friday from a Friday" is the next one). A month or year that lands on a day
// the month doesn't have keeps to its last day (31 January + 1 month = 28 or 29 February).
export function countFrom(from: string, n: number, unit: CalcUnit, dir: 1 | -1): string {
  if (unit === 'days') return addDays(from, n * dir);
  if (unit === 'weeks') return addDays(from, 7 * n * dir);
  if (unit === 'months' || unit === 'years') {
    const d = utc(from);
    const months = (unit === 'years' ? 12 : 1) * n * dir;
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d.getUTCDate(), last));
    return iso(target);
  }
  let at = from;
  let left = n;
  const dow = unit === 'workdays' ? -1 : Number(unit.slice(3));
  while (left > 0) {
    at = addDays(at, dir);
    if (dow < 0 ? isWorkday(at) : utc(at).getUTCDay() === dow) left--;
  }
  return at;
}

// From one date to another: days (negative when `to` is earlier), and the working days counted
// as a working week does (not the first day, the last day if it's a working day).
export function between(from: string, to: string): { days: number; weeks: number; rest: number; workdays: number } {
  const days = Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
  const step = days < 0 ? -1 : 1;
  let workdays = 0;
  for (let at = from, i = 0; i < Math.abs(days); i++) { at = addDays(at, step); if (isWorkday(at)) workdays++; }
  return { days, weeks: Math.trunc(Math.abs(days) / 7), rest: Math.abs(days) % 7, workdays: workdays * step };
}

export const runCalc = (c: DateCalc): string | ReturnType<typeof between> =>
  c.kind === 'count' ? countFrom(c.from, c.n, c.unit, c.dir) : between(c.from, c.to);

// ── Reading a question in words ──

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  next: 1, fortnight: 2,
};
const WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUM = `(\\d+|${Object.keys(NUMBER_WORDS).join('|')})(?:st|nd|rd|th)?`;
const UNIT = `(fortnights?|days?|weeks?|months?|years?|(?:working|business|week)\\s*days?|${WEEKDAY.map((w) => `${w}s?`).join('|')})`;

function unitOf(word: string): { unit: CalcUnit; times: number } | null {
  const w = word.toLowerCase().replace(/\s+/g, '');
  if (/^fortnights?$/.test(w)) return { unit: 'weeks', times: 2 };
  if (/^(working|business|week)days?$/.test(w)) return { unit: 'workdays', times: 1 };
  const day = WEEKDAY.findIndex((d) => w === d || w === `${d}s`);
  if (day >= 0) return { unit: `dow${day}` as CalcUnit, times: 1 };
  const base = w.replace(/s$/, '');
  return ['day', 'week', 'month', 'year'].includes(base) ? { unit: `${base}s` as CalcUnit, times: 1 } : null;
}

const numberOf = (word: string): number => NUMBER_WORDS[word.toLowerCase()] ?? parseInt(word, 10);

function dateOf(text: string, today: string, now: Date): string | null {
  const t = text.trim().replace(/[?.!]+$/, '');
  if (!t || /^(now|today)$/i.test(t)) return today;
  return readDate(t, now);
}

// "the 12th Friday from 1 October 2026", "90 days from yesterday", "3 weeks before 25 Dec",
// "10 working days after next Monday", "2 months ago", "in 6 weeks", "a fortnight from now",
// "how many days between 1 Jan and 1 Mar", "days until Christmas Day 2026", "from 3 May to 9 June".
export function readDateCalc(text: string, now: Date = new Date(), today: string = iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))): DateCalc | null {
  const t = text.trim().toLowerCase()
    .replace(/^(what(?:'s| is)|when is|find|calculate|work out)\s+/, '')
    .replace(/^the\s+date\s+/, '')
    .replace(/[?]+$/, '');

  let m = new RegExp(`^(?:how\\s+(?:many|long)\\s+(?:\\w+\\s+)?)?(?:is\\s+it\\s+)?(?:between|from)\\s+(.+?)\\s+(?:and|to|until|till)\\s+(.+)$`).exec(t);
  if (m) {
    const from = dateOf(m[1], today, now), to = dateOf(m[2], today, now);
    return from && to ? { kind: 'between', from, to } : null;
  }
  m = /^(?:how\s+(?:many|long)\s+(?:\w+\s+)?)?(?:is\s+it\s+)?(?:\w+\s+)?(?:until|till|to|since)\s+(.+)$/.exec(t);
  if (m && !/\b(from|after|before|ago)\b/.test(t)) {
    const d = dateOf(m[1], today, now);
    if (!d) return null;
    return /\bsince\b/.test(t) ? { kind: 'between', from: d, to: today } : { kind: 'between', from: today, to: d };
  }
  m = new RegExp(`^in\\s+${NUM}\\s+${UNIT}$`).exec(t);
  if (m) return count(numberOf(m[1]), m[2], today, 1);
  m = new RegExp(`^(?:the\\s+)?${NUM}\\s+${UNIT}\\s+ago$`).exec(t) ?? new RegExp(`^(?:a\\s+)?(fortnight)\\s+ago$`).exec(t);
  if (m) return m.length === 2 ? count(1, m[1], today, -1) : count(numberOf(m[1]), m[2], today, -1);
  m = new RegExp(`^(?:the\\s+)?(?:${NUM}\\s+)?${UNIT}\\s+(from|after|since|before|prior\\s+to)\\s+(.+)$`).exec(t);
  if (m) {
    const from = dateOf(m[4], today, now);
    if (!from) return null;
    return count(m[1] ? numberOf(m[1]) : 1, m[2], from, /before|prior/.test(m[3]) ? -1 : 1);
  }
  return null;
}

function count(n: number, unitWord: string, from: string, dir: 1 | -1): DateCalc | null {
  const u = unitOf(unitWord);
  if (!u || !Number.isFinite(n) || n < 0) return null;
  return { kind: 'count', from, n: n * u.times, unit: u.unit, dir };
}
