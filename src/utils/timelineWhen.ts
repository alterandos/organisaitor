import { isDayFirstLocale } from './textToTask';

// Reading a timeline entry's When ("28 June 1914", "1990", "January 1990", "01/01/1990",
// "1990-01-01", "Q3 2024", "c. 1200 BC", "the 1990s", "9:30am", "Day 3") as a point to sort by,
// and the order a timeline's entries go in (extensions/Timeline.ts). Pure; never throws. A When
// it can't read keeps the place it was typed in, next to the entry before it.

export interface WhenPoint {
  year:    number | null;   // negative = BC
  month:   number | null;   // 0-11
  day:     number | null;   // 1-31
  minutes: number | null;   // minutes past midnight
}

export type ReadWhen =
  | { scale: 'date'; point: WhenPoint }
  | { scale: `step:${string}`; value: number };   // "Day 3", "Week 2", "Phase 1": counted, not dated

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const ORD = '(?:st|nd|rd|th)?';
const YEAR = "('?\\d{1,4})";
const STEP_WORDS = 'day|week|month|year|phase|step|stage|part|chapter|act|episode|session|lesson|round|level|sprint|term|semester|module|unit|session|block|period';
const SEASONS: Record<string, number> = { spring: 2, summer: 5, autumn: 8, fall: 8, winter: 11 };

const monthIndex = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase());

// "'90" / "90" → 1990 (or 20xx when that's at most ten years ahead); 3-4 digits as written.
function fullYear(token: string, now: Date): number {
  const digits = token.replace("'", '');
  const n = parseInt(digits, 10);
  if (digits.length > 2 && !token.startsWith("'")) return n;
  const pivot = (now.getFullYear() % 100) + 10;
  const century = Math.floor(now.getFullYear() / 100) * 100;
  return n <= pivot ? century + n : century - 100 + n;
}

const validDay = (d: number) => d >= 1 && d <= 31;
const validMonth = (m: number) => m >= 0 && m <= 11;

// A time anywhere in the text, and the text without it.
function takeTime(s: string): { minutes: number | null; rest: string } {
  let m = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s|$|[,;)])/i);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (h >= 1 && h <= 12 && min < 60) {
      const pm = m[3].toLowerCase().startsWith('p');
      return { minutes: ((h % 12) + (pm ? 12 : 0)) * 60 + min, rest: s.replace(m[0], ' ') };
    }
  }
  m = s.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
  if (m) return { minutes: parseInt(m[1], 10) * 60 + parseInt(m[2], 10), rest: s.replace(m[0], ' ') };
  m = s.match(/\b(noon|midday|midnight)\b/i);
  if (m) return { minutes: m[1].toLowerCase() === 'midnight' ? 0 : 720, rest: s.replace(m[0], ' ') };
  return { minutes: null, rest: s };
}

// "early" / "mid" / "late": where in a decade, century or year.
function modifierOf(s: string): 'early' | 'mid' | 'late' | null {
  const m = s.match(/\b(early|mid|late)\b/i);
  return m ? (m[1].toLowerCase() as 'early' | 'mid' | 'late') : null;
}

// One point (no range). `sign` is -1 for BC; `era` says an era was written.
function readPoint(text: string, sign: 1 | -1, era: boolean, dayFirst: boolean, now: Date): WhenPoint | null {
  const { minutes, rest } = takeTime(text);
  const s = rest;
  const point = (year: number | null, month: number | null = null, day: number | null = null): WhenPoint =>
    ({ year: year === null ? null : year * sign, month, day, minutes });
  let m: RegExpMatchArray | null;

  // 1990-01-01, 1990/01, 1990.1.1
  if ((m = s.match(/\b(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?\b/))) {
    const mo = parseInt(m[2], 10) - 1;
    const d = m[3] ? parseInt(m[3], 10) : null;
    if (validMonth(mo) && (d === null || validDay(d))) return point(parseInt(m[1], 10), mo, d);
  }
  // 01/01/1990, 1.2.90, 1-2-1990 (day or month first by the locale when both could be either)
  if ((m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/))) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    const [d, mo] = p1 > 12 ? [p1, p2] : p2 > 12 ? [p2, p1] : dayFirst ? [p1, p2] : [p2, p1];
    if (validDay(d) && validMonth(mo - 1)) return point(fullYear(m[3], now), mo - 1, d);
  }
  // 1 Jan 1990, 1st of January, 1990, 28 June
  if ((m = s.match(new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH}(?:,?\\s+${YEAR}(?!\\d))?\\b`, 'i')))) {
    const d = parseInt(m[1], 10);
    if (validDay(d)) return point(m[3] ? fullYear(m[3], now) : null, monthIndex(m[2]), d);
  }
  // January 1, 1990, Jan 1st
  if ((m = s.match(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORD}(?!\\d)(?:,?\\s+${YEAR}(?!\\d))?`, 'i')))) {
    const d = parseInt(m[2], 10);
    if (validDay(d)) return point(m[3] ? fullYear(m[3], now) : null, monthIndex(m[1]), d);
  }
  // January 1990, Jan '90, March of 1990
  if ((m = s.match(new RegExp(`\\b${MONTH}(?:\\s+of)?,?\\s+${YEAR}(?!\\d)`, 'i')))) {
    return point(fullYear(m[2], now), monthIndex(m[1]), null);
  }
  // Q3 2024, 2024 Q3, H2 2024
  if ((m = s.match(/\b(\d{4})\s*([qh])([1-4])\b/i)) || (m = s.match(/\b([qh])([1-4])\b(?:\s*('?\d{2,4}))?/i))) {
    const [letter, n, y] = /^\d/.test(m[1]) ? [m[2], m[3], m[1]] : [m[1], m[2], m[3]];
    const q = parseInt(n, 10);
    const half = letter.toLowerCase() === 'h';
    if (!half || q <= 2) return point(y ? fullYear(y, now) : null, half ? (q - 1) * 6 : (q - 1) * 3, null);
  }
  // Summer 1990
  if ((m = s.match(/\b(spring|summer|autumn|fall|winter)\b(?:\s+(?:of\s+)?('?\d{2,4}))?/i))) {
    return point(m[2] ? fullYear(m[2], now) : null, SEASONS[m[1].toLowerCase()], null);
  }
  // 19th century, early 20th century
  if ((m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+century\b/i))) {
    const start = (parseInt(m[1], 10) - 1) * 100;
    const mod = modifierOf(s);
    return point(start + (mod === 'mid' ? 50 : mod === 'late' ? 80 : 0));
  }
  // the 1990s, '90s, late 1800s
  if ((m = s.match(/(?:\b|')(\d{1,3})0'?s\b/))) {
    const digits = m[1];
    const start = digits.length === 1 ? fullYear(`${digits}0`, now) : parseInt(`${digits}0`, 10);
    const mod = modifierOf(s);
    const span = digits.length === 3 && digits.endsWith('0') ? 100 : 10;   // the 1800s: a century
    return point(start + (mod === 'mid' ? span / 2 : mod === 'late' ? span * 0.8 : 0));
  }
  // A month on its own: "June" (its year comes from the entry before)
  if ((m = s.match(new RegExp(`\\b${MONTH}\\b`, 'i')))) return point(null, monthIndex(m[1]), null);
  // A year: 3-4 digits, or any number with an era (33 AD, 500 BC)
  if ((m = s.match(/\b(\d{3,4})\b/)) || (era && (m = s.match(/\b(\d{1,4})\b/)))) {
    const y = parseInt(m[1], 10);
    const mod = modifierOf(s);
    return point(y, mod === 'mid' ? 5 : mod === 'late' ? 9 : null, null);
  }
  if (minutes !== null) return point(null);
  return null;
}

// Takes the era off ("BC", "B.C.E.", "AD", "CE") and the "about" off ("c.", "circa", "~").
// `era` says one was written, which makes a short number a year ("AD 79", "44 BC").
function eraOf(text: string): { text: string; sign: 1 | -1; era: boolean } {
  let s = text.replace(/^\s*(?:c\.|ca\.?|circa|approx\.?|approximately|around|about|~)\s*/i, '');
  let sign: 1 | -1 = 1;
  let era = false;
  const bc = /\b(b\.?\s?c\.?(?:\s?e\.?)?)(?=\s|$|[,;)–—-])/i;
  if (bc.test(s)) { sign = -1; era = true; s = s.replace(bc, ' '); }
  const ad = /\b(?:a\.?\s?d\.?|c\.e\.|ce)(?=\s|$|[,;)–—-])/i;
  if (ad.test(s)) { era = true; s = s.replace(ad, ' '); }
  return { text: s, sign, era };
}

export function readTimelineWhen(raw: string, dayFirst: boolean = isDayFirstLocale(), now: Date = new Date()): ReadWhen | null {
  const text = raw.trim();
  if (!text) return null;
  const step = text.match(new RegExp(`^(?:the\\s+)?(${STEP_WORDS})\\s*#?\\s*(\\d+)\\b`, 'i'));
  if (step) return { scale: `step:${step[1].toLowerCase()}`, value: parseInt(step[2], 10) };

  // A range reads as its start; the start takes its year and era from the end when it has none
  // ("June – July 1914", "500–400 BC", "1914-18").
  const years = text.match(/^(\d{3,4})-(\d{2,4})$/);   // 1914-18 (but not 1990-01, a month)
  const range = text.match(/^(.+?)\s*(?:[–—]|\s-\s|\s+(?:to|until|till|through|thru)\s+|→)\s*(.+)$/i)
    ?? (years && (years[2].length > 2 || parseInt(years[2], 10) > 12) ? years : null);
  if (range) {
    const end = eraOf(range[2]);
    const startEra = eraOf(range[1]);
    const sign = startEra.sign === -1 || end.sign === -1 ? -1 : 1;
    const start = readPoint(startEra.text, sign, startEra.era || end.era, dayFirst, now);
    if (start) {
      if (start.year === null && start.month !== null) {
        const finish = readPoint(end.text, end.sign, end.era, dayFirst, now);
        if (finish?.year != null) start.year = finish.year;
      }
      return { scale: 'date', point: start };
    }
  }
  const { text: s, sign, era } = eraOf(text);
  const point = readPoint(s, sign, era, dayFirst, now);
  return point ? { scale: 'date', point } : null;
}

// ── Ordering a timeline ──────────────────────────────────────────────────────

export type TimelineOrder = 'asc' | 'desc' | 'manual';

export interface TimelineReading {
  order:        number[];          // the entries' indices, in the order they should be in
  inferredYear: (number | null)[]; // per entry: a year it was read with but doesn't say ("23 July" after "28 June 1914")
}

const sortKey = (y: number, mo: number, d: number, min: number) => ((y * 12 + mo) * 31 + (d - 1)) * 1440 + min;

// How a timeline's entries (their When texts, in document order) should be ordered.
// - Entries are read on the scale most of them use (dates, or "Day 1, Day 2"); the rest are kept.
// - A When without a year takes the year of the dated entry before it; a time alone takes its date.
// - An entry that can't be placed stays right after the entry it follows now, so notes written
//   under an undated heading move with it. Undated entries before the first dated one stay first.
// - The sort is stable: entries on the same date keep the order they were typed in.
export function readTimeline(whens: string[], order: TimelineOrder, dayFirst: boolean = isDayFirstLocale(), now: Date = new Date()): TimelineReading {
  const reads = whens.map((w) => readTimelineWhen(w, dayFirst, now));
  const counts = new Map<string, number>();
  for (const r of reads) if (r) counts.set(r.scale, (counts.get(r.scale) ?? 0) + 1);
  let scale: string | null = null;
  for (const [k, n] of counts) if (scale === null || n > counts.get(scale)! || (n === counts.get(scale) && k === 'date')) scale = k;

  const keys: (number | null)[] = [];
  const inferredYear: (number | null)[] = [];
  const hasYear = reads.some((r) => r?.scale === 'date' && r.point.year !== null);
  let ctx = { year: null as number | null, month: 0, day: 1 };
  for (const r of reads) {
    inferredYear.push(null);
    if (!r || r.scale !== scale) { keys.push(null); continue; }
    if (r.scale !== 'date') { keys.push(r.value); continue; }
    const p = r.point;
    let { year, month, day } = { year: p.year, month: p.month, day: p.day };
    if (year === null && month === null) ({ year, month, day } = { year: ctx.year, month: ctx.month, day: ctx.day });
    else if (year === null && ctx.year !== null) { year = ctx.year; if (hasYear) inferredYear[inferredYear.length - 1] = ctx.year; }
    keys.push(sortKey(year ?? 0, month ?? 0, day ?? 1, p.minutes ?? 0));
    if (p.year !== null) ctx = { year: p.year, month: p.month ?? 0, day: p.day ?? 1 };
    else if (p.month !== null) ctx = { year: ctx.year, month: p.month, day: p.day ?? 1 };
  }

  const groups: { key: number | null; members: number[] }[] = [];
  keys.forEach((key, i) => {
    if (key !== null || groups.length === 0) groups.push({ key, members: [i] });
    else groups[groups.length - 1].members.push(i);
  });
  if (order !== 'manual') {
    const lead = groups[0]?.key === null ? groups.shift()! : null;
    const dir = order === 'asc' ? 1 : -1;
    groups.sort((a, b) => dir * (a.key! - b.key!));
    if (lead) groups.unshift(lead);
  }
  return { order: groups.flatMap((g) => g.members), inferredYear };
}
