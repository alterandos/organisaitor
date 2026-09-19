// Lightweight, non-AI inference for "create a Task from selected note text": date, time,
// priority, and links. Always shown to the user for confirmation/editing (via the real
// AddTaskModal, pre-filled) before a task is actually created — never used to silently
// populate data.
import type { Priority } from '@/types';
import { extractUrls } from '@/utils/links';

export interface InferredTaskFields {
  title:        string;
  deadline:     string | null;  // YYYY-MM-DD
  deadlineTime: string | null;  // HH:MM (24-hour)
  priority:     Priority | null; // null = no signal found, caller should default to 'none'
  links:        string[];
}

const MONTH_PATTERN =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const TRIGGER_WORDS = /\b(by|due|deadline|before|until|on)\b/gi;

interface DateCandidate {
  index:  number;   // start offset in the source text
  length: number;
  y: number; m: number; d: number;  // m is 0-based
  yearExplicit: boolean;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// If no explicit year was given, roll a past-seeming date forward one year — "by March 5th"
// mentioned in September most likely means the next occurrence of that date, not one already
// gone. An explicit year is always respected as-is, even if it's in the past.
function resolveYear(y: number, m: number, d: number, yearExplicit: boolean, today: Date): number {
  if (yearExplicit) return y;
  const candidate = new Date(y, m, d);
  return candidate < atMidnight(today) ? y + 1 : y;
}

function nextWeekdayOffset(today: Date, targetDow: number, strictlyAfter: boolean): number {
  let diff = (targetDow - today.getDay() + 7) % 7;
  if (diff === 0 && strictlyAfter) diff = 7;
  return diff;
}

function addDays(base: Date, days: number): Date {
  const d = atMidnight(base);
  d.setDate(d.getDate() + days);
  return d;
}

// Resolves whether the local convention reads day-before-month (e.g. Australia/UK/most of
// the world: DD/MM) or month-before-day (US: MM/DD), via Intl rather than a hardcoded guess —
// used only to break a genuine tie (both parts ≤ 12) when a year makes it clear *some* real
// date was intended, just not which part is which. Defaults to day-first (the more common
// convention worldwide) if Intl can't answer.
function isDayFirstLocale(): boolean {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(2020, 0, 2));
    const dayIdx = parts.findIndex((p) => p.type === 'day');
    const monthIdx = parts.findIndex((p) => p.type === 'month');
    return dayIdx >= 0 && monthIdx >= 0 && dayIdx < monthIdx;
  } catch {
    return true;
  }
}

function blank(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

// Resolves one (p1, p2, year?) numeric pair into a {day, month}, or null to skip. An
// unambiguous pair (one part > 12) resolves regardless of whether a year is present; an
// ambiguous pair (both ≤ 12) only resolves when a year is present too — a bare 2-part
// ambiguous date is far too likely to be something else entirely (a page range "10-15", a
// decimal "3.14", a score) to guess at. Callers control how a year can even reach here: the
// dash/dot regex always captures one (so this only skips on genuine ambiguity when unusable),
// the slash regex's year group is optional, matching the older, looser slash-specific rule.
function resolveDayMonth(p1: number, p2: number, hasYear: boolean, dayFirst: boolean): { day: number; month: number } | null {
  if (p1 > 12 && p2 <= 12) return { day: p1, month: p2 };
  if (p2 > 12 && p1 <= 12) return { day: p2, month: p1 };
  if (p1 > 12 && p2 > 12) return null; // neither can be a month
  if (!hasYear) return null; // ambiguous, no year — too risky, skip
  return dayFirst ? { day: p1, month: p2 } : { day: p2, month: p1 };
}

function findDateCandidates(text: string, today: Date): DateCandidate[] {
  const candidates: DateCandidate[] = [];
  let working = text;
  const dayFirst = isDayFirstLocale();

  function claim(re: RegExp, resolve: (m: RegExpExecArray) => Omit<DateCandidate, 'index' | 'length'> | null) {
    for (const m of [...working.matchAll(re)]) {
      const resolved = resolve(m);
      if (resolved) {
        candidates.push({ index: m.index ?? 0, length: m[0].length, ...resolved });
        working = blank(working, m.index ?? 0, (m.index ?? 0) + m[0].length);
      }
    }
  }

  function ymd(d: Date) {
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }

  // 1. Relative terms — unambiguous, checked first.
  claim(/\btoday\b/gi, () => ({ ...ymd(atMidnight(today)), yearExplicit: true }));
  claim(/\btomorrow\b/gi, () => ({ ...ymd(addDays(today, 1)), yearExplicit: true }));
  claim(/\btonight\b/gi, () => ({ ...ymd(atMidnight(today)), yearExplicit: true }));
  claim(/\bnext\s+weekend\b/gi, () => ({ ...ymd(addDays(today, nextWeekdayOffset(today, 6, false) + 7)), yearExplicit: true }));
  claim(/\bthis\s+weekend\b/gi, () => ({ ...ymd(addDays(today, nextWeekdayOffset(today, 6, false))), yearExplicit: true }));
  claim(/\bin\s+(\d+)\s+week(?:s)?\b/gi, (m) => ({ ...ymd(addDays(today, parseInt(m[1], 10) * 7)), yearExplicit: true }));
  claim(/\bin\s+(\d+)\s+day(?:s)?\b/gi, (m) => ({ ...ymd(addDays(today, parseInt(m[1], 10))), yearExplicit: true }));
  claim(/\bnext\s+week\b/gi, () => ({ ...ymd(addDays(today, 7)), yearExplicit: true }));
  claim(new RegExp(`\\b(next|this)\\s+(${WEEKDAYS.join('|')})\\b`, 'gi'), (m) => {
    const dow = WEEKDAYS.indexOf(m[2].toLowerCase());
    const strict = m[1].toLowerCase() === 'next';
    return { ...ymd(addDays(today, nextWeekdayOffset(today, dow, strict))), yearExplicit: true };
  });
  claim(new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`, 'gi'), (m) => {
    const dow = WEEKDAYS.indexOf(m[1].toLowerCase());
    return { ...ymd(addDays(today, nextWeekdayOffset(today, dow, false))), yearExplicit: true };
  });

  // 2. ISO: YYYY-MM-DD
  claim(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, d = parseInt(m[3], 10);
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    return { y, m: mo, d, yearExplicit: true };
  });

  // 3. "Month Day[, Year]" — e.g. "March 5th, 2027"
  claim(new RegExp(`\\b${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi'), (m) => {
    const mo = MONTH_INDEX[m[1].slice(0, 3).toLowerCase()];
    const d = parseInt(m[2], 10);
    const yearExplicit = !!m[3];
    const y = yearExplicit ? parseInt(m[3], 10) : today.getFullYear();
    if (mo === undefined || d < 1 || d > 31) return null;
    return { y, m: mo, d, yearExplicit };
  });

  // 4. "Day [of] Month[, Year]" — e.g. "5th of March, 2027"
  claim(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_PATTERN}\\.?(?:,?\\s+(\\d{4}))?\\b`, 'gi'), (m) => {
    const d = parseInt(m[1], 10);
    const mo = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    const yearExplicit = !!m[3];
    const y = yearExplicit ? parseInt(m[3], 10) : today.getFullYear();
    if (mo === undefined || d < 1 || d > 31) return null;
    return { y, m: mo, d, yearExplicit };
  });

  // 5. Numeric D/M[/Y] — slash keeps the looser "accept without a year if unambiguous" rule
  claim(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (m) => {
    const p1 = parseInt(m[1], 10), p2 = parseInt(m[2], 10);
    const yearExplicit = !!m[3];
    const dm = resolveDayMonth(p1, p2, yearExplicit, dayFirst);
    if (!dm) return null;
    let y = today.getFullYear();
    if (yearExplicit) { y = parseInt(m[3], 10); if (m[3].length === 2) y += 2000; }
    return { y, m: dm.month - 1, d: dm.day, yearExplicit };
  });

  // 6. Numeric D-M-Y or D.M.Y — dash/dot require an explicit year (too many false positives
  // otherwise: "pages 10-15", "10-15 minutes", "3.14", prices like "19.99")
  claim(/\b(\d{1,2})[-.](\d{1,2})[-.](\d{2,4})\b/g, (m) => {
    const p1 = parseInt(m[1], 10), p2 = parseInt(m[2], 10);
    const dm = resolveDayMonth(p1, p2, true, dayFirst);
    if (!dm) return null;
    let y = parseInt(m[3], 10);
    if (m[3].length === 2) y += 2000;
    return { y, m: dm.month - 1, d: dm.day, yearExplicit: true };
  });

  return candidates.sort((a, b) => a.index - b.index);
}

interface Span { start: number; end: number }

function spanOf(m: RegExpExecArray): Span {
  return { start: m.index, end: m.index + m[0].length };
}

function findTimeMatch(text: string): ({ time: string } & Span) | null {
  const word = /\b(noon|midnight)\b/i.exec(text);
  if (word) return { time: word[1].toLowerCase() === 'noon' ? '12:00' : '00:00', ...spanOf(word) };
  const ampm = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i.exec(text);
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12;
    if (ampm[3].toLowerCase() === 'pm') h += 12;
    const min = ampm[2] ? parseInt(ampm[2], 10) : 0;
    return { time: `${pad2(h)}:${pad2(min)}`, ...spanOf(ampm) };
  }
  const h24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (h24) return { time: `${pad2(parseInt(h24[1], 10))}:${h24[2]}`, ...spanOf(h24) };
  return null;
}

function pickBestCandidate(text: string, candidates: DateCandidate[]): DateCandidate | null {
  if (candidates.length === 0) return null;

  const triggerEnds: number[] = [];
  for (const m of text.matchAll(TRIGGER_WORDS)) {
    triggerEnds.push((m.index ?? 0) + m[0].length);
  }

  const prioritized = candidates.find((c) =>
    triggerEnds.some((end) => end <= c.index && c.index - end <= 30)
  );
  return prioritized ?? candidates[0];
}

// Keyword-based, checked in this order since "medium" alone is a weak/generic word that
// shouldn't fire without explicit "priority" context, while "urgent"/"asap" are strong
// standalone signals for high on their own.
function inferPriorityFromText(text: string): Priority | null {
  if (/\b(urgent|asap|critical|high[\s-]?priority|priority:?\s*high)\b/i.test(text)) return 'high';
  if (/!!/.test(text)) return 'high';
  if (/\b(low[\s-]?priority|priority:?\s*low|no rush|not urgent|whenever)\b/i.test(text)) return 'low';
  if (/\b(medium[\s-]?priority|priority:?\s*medium|moderate priority)\b/i.test(text)) return 'medium';
  return null;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi;

function findLinkSpans(text: string): Span[] {
  return [...text.matchAll(URL_PATTERN)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

function inferDateMatch(rawText: string, now: Date): ({ iso: string } & Span) | null {
  const candidates = findDateCandidates(rawText, now)
    .map((c) => ({ ...c, y: resolveYear(c.y, c.m, c.d, c.yearExplicit, now) }));
  const best = pickBestCandidate(rawText, candidates);
  return best ? { iso: toIso(best.y, best.m, best.d), start: best.index, end: best.index + best.length } : null;
}

export function inferTaskFromSelection(rawText: string, now: Date = new Date()): InferredTaskFields {
  const dateMatch = inferDateMatch(rawText, now);
  const deadline = dateMatch?.iso ?? null;
  // A time is only used (and so only removed from the title) alongside a date.
  const timeMatch = dateMatch ? findTimeMatch(rawText) : null;
  const deadlineTime = timeMatch?.time ?? null;
  // Date, time and plain URLs (which become the task's links) come out of the title, with the
  // connector words that introduced them — see stripSpans. Priority words stay: "urgent" is
  // still part of what the task says.
  const title = stripSpans(rawText, [
    ...(dateMatch ? [dateMatch] : []),
    ...(timeMatch ? [timeMatch] : []),
    ...findLinkSpans(rawText),
  ]);

  return {
    title,
    deadline,
    deadlineTime,
    priority: inferPriorityFromText(rawText),
    links: extractUrls(rawText),
  };
}

// ── Calendar item (event or reminder) ─────────────────────────────────────────

export interface InferredCalendarFields {
  title:     string;
  kind:      'event' | 'reminder';
  date:      string | null;   // YYYY-MM-DD — null = no date found, caller defaults to today
  startTime: string | null;   // HH:MM (24-hour)
  endTime:   string | null;
  location:  string | null;   // first link found (a meeting URL reads naturally as an event's location)
  notes:     string | null;   // any further links
}

const EVENT_WORDS = /\b(meeting|appointment|lunch|dinner|breakfast|interview|class|lecture|conference|party|flight|session|workshop|webinar|seminar|catch[\s-]?up|check[\s-]?in|concert|wedding)\b/i;

function to24hMinutes(hour: number, minute: number, meridiem: string | undefined): number {
  if (!meridiem) return hour * 60 + minute;
  let h = hour % 12;
  if (meridiem.toLowerCase() === 'pm') h += 12;
  return h * 60 + minute;
}

// "2pm-3pm", "2-3pm", "14:00 to 15:30", "9:30am – 10:15am". Each side must carry a colon or an
// am/pm (the start may borrow the end's am/pm) — a bare "10-15" is far more likely a page range
// or a count than a time range, same caution the numeric-date rules above take.
function findTimeRange(text: string): ({ start: string; end: string } & { span: Span }) | null {
  const m = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\b/i.exec(text);
  if (!m) return null;
  const [, h1, m1, mer1, h2, m2, mer2] = m;
  if (!(m1 || mer1 || mer2) || !(m2 || mer2)) return null;
  const sh = parseInt(h1, 10), eh = parseInt(h2, 10);
  if (sh > 24 || eh > 24) return null;
  const endMin = to24hMinutes(eh, m2 ? parseInt(m2, 10) : 0, mer2);
  let startMin = to24hMinutes(sh, m1 ? parseInt(m1, 10) : 0, mer1 ?? mer2);
  // "11-1pm" borrowed pm for the start, putting it after the end — the start meant am.
  if (!mer1 && startMin > endMin && startMin >= 12 * 60) startMin -= 12 * 60;
  const fmt = (min: number) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
  return { start: fmt(startMin), end: fmt(endMin), span: spanOf(m) };
}

// Words that only introduced a date or time ("due ON Friday", "meet AT 2pm", "FROM 2pm to 3pm",
// "ON THE 5th") — they go with it once it's been lifted out into its own field. A connector can
// stack with an article; "due" and similar words that say what the thing IS are left alone.
const LEADING_CONNECTOR = /(?:(?:\b(?:on|by|before|until|till|at|from|around)\s+|@\s*)?(?:the\s+)?)$/i;

// Removes the given spans (plus any connector words just before each) from the text and tidies
// what's left: collapsed whitespace, no dangling punctuation or empty brackets. Falls back to the
// original if nothing meaningful remains (the whole selection was just a date).
function stripSpans(text: string, spans: Span[]): string {
  const extended = spans.map((sp) => {
    const m = LEADING_CONNECTOR.exec(text.slice(0, sp.start));
    return { start: m ? sp.start - m[0].length : sp.start, end: sp.end };
  }).sort((a, b) => a.start - b.start);

  const merged: Span[] = [];
  for (const sp of extended) {
    const last = merged[merged.length - 1];
    if (last && sp.start <= last.end) last.end = Math.max(last.end, sp.end);
    else merged.push({ ...sp });
  }

  let out = '';
  let cursor = 0;
  for (const sp of merged) { out += text.slice(cursor, sp.start) + ' '; cursor = sp.end; }
  out += text.slice(cursor);

  const cleaned = out
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')
    .trim();
  return cleaned || text.replace(/\s+/g, ' ').trim();
}

// Event vs reminder: a time range, or a word naming something you attend, reads as an event (it
// occupies time); anything else reads as a reminder (a point in time to be nudged about). A best
// guess only — the modal it opens in still has the Event/Reminder toggle.
export function inferCalendarItemFromSelection(rawText: string, extraLinks: string[] = [], now: Date = new Date()): InferredCalendarFields {
  const dateMatch = inferDateMatch(rawText, now);
  const date = dateMatch?.iso ?? null;
  const range = findTimeRange(rawText);
  const timeMatch = range ? null : findTimeMatch(rawText);
  // Everything that ends up in its own field (date, time(s), links) comes out of the title.
  const title = stripSpans(rawText, [
    ...(dateMatch ? [dateMatch] : []),
    ...(range ? [range.span] : timeMatch ? [timeMatch] : []),
    ...findLinkSpans(rawText),
  ]);
  const kind = range || EVENT_WORDS.test(rawText) ? 'event' : 'reminder';
  const links = [...new Set([...extractUrls(rawText), ...extraLinks])];

  return {
    title,
    kind,
    date,
    startTime: range?.start ?? timeMatch?.time ?? null,
    endTime: range?.end ?? null,
    location: kind === 'event' ? (links[0] ?? null) : null,
    notes: (kind === 'event' ? links.slice(1) : links).join('\n') || null,
  };
}
