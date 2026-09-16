// Lightweight, non-AI inference for "create a Task from selected note text": date, time,
// priority, and links. Always shown to the user for confirmation/editing (via the real
// AddTaskModal, pre-filled) before a task is actually created — never used to silently
// populate data.
import type { Priority } from '@/types';
import { normalizeLinkUrl } from '@/utils/links';

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

function findTime(text: string): string | null {
  if (/\bnoon\b/i.test(text)) return '12:00';
  if (/\bmidnight\b/i.test(text)) return '00:00';
  const ampm = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i.exec(text);
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12;
    if (ampm[3].toLowerCase() === 'pm') h += 12;
    const min = ampm[2] ? parseInt(ampm[2], 10) : 0;
    return `${pad2(h)}:${pad2(min)}`;
  }
  const h24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (h24) return `${pad2(parseInt(h24[1], 10))}:${h24[2]}`;
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

function inferLinksFromText(text: string): string[] {
  const found = text.match(/\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi) ?? [];
  const cleaned = found
    .map((u) => u.replace(/[.,;:!?)]+$/, '')) // trim trailing sentence punctuation
    .map((u) => normalizeLinkUrl(u))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

export function inferTaskFromSelection(rawText: string, now: Date = new Date()): InferredTaskFields {
  const title = rawText.replace(/\s+/g, ' ').trim();

  const candidates = findDateCandidates(rawText, now)
    .map((c) => ({ ...c, y: resolveYear(c.y, c.m, c.d, c.yearExplicit, now) }));
  const best = pickBestCandidate(rawText, candidates);

  const deadline = best ? toIso(best.y, best.m, best.d) : null;
  const deadlineTime = deadline ? findTime(rawText) : null;

  return {
    title,
    deadline,
    deadlineTime,
    priority: inferPriorityFromText(rawText),
    links: inferLinksFromText(rawText),
  };
}
