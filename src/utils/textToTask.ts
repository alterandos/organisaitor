// Lightweight, non-AI inference for "create a Task from selected note text": date, time,
// priority, and links. Always shown to the user for confirmation/editing (via the real
// AddTaskModal, pre-filled) before a task is actually created — never used to silently
// populate data.
import type { Priority, RepeatConfig } from '@/types';
import { extractUrls } from '@/utils/links';
import { firstNthWeekdayFrom } from '@/utils/recurrence';

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
export function isDayFirstLocale(): boolean {
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
  claim(/\byesterday\b/gi, () => ({ ...ymd(addDays(today, -1)), yearExplicit: true }));
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

  // 7. A day of the month on its own: "on the 1st", "by the 15th". The next time that day comes
  // round (today counts). Needs "the" and an ordinal, so a bare "15" never matches. A day the
  // month doesn't have ("the 31st" in September) moves on to the next month that has it.
  claim(/\b(?:(?:on|by|before)\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/gi, (m) => {
    const d = parseInt(m[1], 10);
    if (d < 1 || d > 31) return null;
    const start = atMidnight(today);
    for (let k = 0; k < 13; k++) {
      const c = new Date(start.getFullYear(), start.getMonth() + k, d);
      if (c.getDate() === d && c >= start) return { ...ymd(c), yearExplicit: true };
    }
    return null;
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
  kind:      'event' | 'reminder' | 'deadline';
  date:      string | null;   // YYYY-MM-DD — null = no date found, caller defaults to today
  startTime: string | null;   // HH:MM (24-hour) — for a reminder/deadline, its time
  endTime:   string | null;
  location:  string | null;   // an address in the text, else (an event) its first link — a meeting URL reads naturally as a location
  notes:     string | null;   // the links not used as the location, one per line
  links:     string[];        // every link in the text (the magic wand fills the Links field from these)
  eventType: 'default' | 'birthday' | 'travel';   // events only
  tentative: boolean;         // "maybe", "TBC", "pencil in"…
  important: boolean;         // "urgent", "important", "!!"…
  repeat:    RepeatConfig | null;   // with its weekdays, nth weekday and end when the text says them
}

// ── Cue phrases ──
// Each is a best guess that the modal the result opens in still shows for confirmation. The
// *_STRIP patterns are phrases that only say WHAT KIND of thing this is ("remind me to", "the
// deadline for … is", "TBC", "every Monday"), so they come out of the title along with the date.

// Things you attend or take part in, so they occupy time.
const EVENT_WORDS = /\b(meeting|meet(?:ing)?\s+(?:with|up)|appointment|appt|lunch|dinner|breakfast|brunch|coffee|drinks|interview|class|lecture|tutorial|lab|exam|conference|party|session|workshop|webinar|seminar|catch[\s-]?up|check[\s-]?in|concert|wedding|call|zoom|standup|stand[\s-]up|sync|1:1|one[\s-]on[\s-]one|dentist|doctor|physio|haircut|gym|training|practice|game|match|gig|movie|date night|ceremony|funeral|recital)\b/i;

// Journeys: time that's booked out without being something you're "at" (CalendarEventType 'travel').
const TRAVEL_WORDS = /\b(flights?|fly(?:ing)?\s+(?:to|from|out|home|back|into)|plane|train\s+(?:to|from|home)|bus\s+(?:to|from|home)|coach\s+(?:to|from)|ferry|drive\s+(?:to|from|home|back)|driving\s+(?:to|from|home|back)|road\s*trip|departs?|departure|departing|boarding|layover|stopover|transfer\s+to|(?:uber|taxi|cab|shuttle)\s+to|commute)\b/i;

const BIRTHDAY_WORDS = /\b(birthday|b-?day|b'day)\b/i;

// "by Friday", "before the 5th", "no later than 3 Oct" — when that's what introduces the date.
const DEADLINE_DATE_CONNECTOR = /\b(?:by|before|no later than|not later than)\s+(?:the\s+)?$/i;
// Words that mean "something is due" wherever they sit. "deadline" itself only counts when it's
// what the sentence is about ("the deadline is…", "deadline: …", a leading "Deadline for X") —
// "discuss the deadline tomorrow" is a meeting.
const DEADLINE_WORDS = /\b(due|overdue|expires?|expiry|expiration|closing date|applications?\s+close|closes|cut[\s-]?off|last day (?:to|for)|final day (?:to|for)|submit|submission|hand[\s-]?in|lodge(?:ment)?|lodgment|no later than)\b/i;
const DEADLINE_LEAD = /^\s*(?:the\s+)?(?:deadline|due date|cut[\s-]?off)\b\s*(?:for|of|to|on)?\s*(?:is\b|:|[-–])?\s*/i;
const DEADLINE_IS = /\b(?:deadline|due date|cut[\s-]?off)\s*(?:is\b|:)\s*/i;
// "the deadline for the grant is Friday" — only with an "is" still to come, so "discuss the
// deadline for the report tomorrow" stays a meeting.
const DEADLINE_FOR = /\b(?:the\s+)?(?:deadline|due date|cut[\s-]?off)\s+(?:for|of|to)\s+(?=.+?\s(?:is|are)\b)/i;

const REMINDER_WORDS = /\b(remind(?:er)?|don'?t forget|do not forget|remember to|make sure (?:to|that|i)|note to self|nudge me|ping me|heads[\s-]?up)\b/i;
const REMINDER_STRIP = /\b(?:please\s+)?(?:remind\s+me(?:\s+(?:to|that|about|of))?|reminder(?:\s+(?:to|that|about))?\s*[:\-–]?|don'?t\s+forget(?:\s+(?:to|that|about))?|do\s+not\s+forget(?:\s+(?:to|that|about))?|remember\s+to|make\s+sure\s+(?:to|that)|note\s+to\s+self\s*[:\-–]?|nudge\s+me(?:\s+(?:to|about))?|ping\s+me(?:\s+(?:to|about))?|heads[\s-]?up\s*[:\-–]?)\s*/gi;

const TENTATIVE_STRIP = /\(?\b(?:maybe|possibly|perhaps|tentative(?:ly)?|provisional(?:ly)?|tbc|tbd|to be confirmed|pencil(?:l?ed)?\s+in)\b\)?\s*/gi;

const IMPORTANT_WORDS = /\b(important|urgent|asap|critical|must[\s-]not[\s-]miss|don'?t miss|do not miss)\b|!!/i;
const IMPORTANT_STRIP = /^\s*(?:important|urgent|asap)\s*[:\-–!]+\s*|!{2,}/gi;

const WEEKDAY_WORD = '(sun|mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur)(?:day)?';
const ORDINALS: Record<string, number> = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, last: -1 };
const weekdayIndex = (word: string) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(word.slice(0, 3).toLowerCase());

// "every 3rd Sunday of the month", "the last Friday of every month", "first Monday monthly". It
// needs "every"/"each" before it or the month after it: "the first Monday of November" is a date.
const NTH_WEEKDAY = new RegExp(`\\b(?:(every|each)\\s+(?:the\\s+)?|(?:on\\s+)?the\\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)\\s+${WEEKDAY_WORD}s?(\\s+of\\s+(?:the|every|each)\\s+month|\\s+(?:of\\s+)?(?:every|each)\\s+month|\\s+monthly)?\\b`, 'i');
// "every weekday", "every Monday and Thursday", "every other Tuesday".
const WEEKDAYS_REPEAT = new RegExp(`\\bevery\\s+(?:(other)\\s+)?(weekdays?|${WEEKDAY_WORD}s?(?:\\s*(?:,|and|&)\\s*${WEEKDAY_WORD}s?)*)\\b`, 'i');
const REPEAT = /\bevery\s+(?:(other)\s+)?(?:(\d+)\s+)?(day|week|fortnight|month|year)s?\b|\b(daily|weekly|fortnightly|monthly|yearly|annually)\b/i;

type RepeatRule = Pick<RepeatConfig, 'freq' | 'interval' | 'daysOfWeek' | 'monthWeekday'>;

function findRepeat(text: string): { rule: RepeatRule; span: Span } | null {
  const nth = NTH_WEEKDAY.exec(text);
  if (nth && (nth[1] || nth[4])) {
    return { rule: { freq: 'monthly', interval: 1, monthWeekday: { week: ORDINALS[nth[2].toLowerCase()], day: weekdayIndex(nth[3]) } }, span: spanOf(nth) };
  }
  const days = WEEKDAYS_REPEAT.exec(text);
  if (days) {
    const list = /^weekdays?$/i.test(days[2])
      ? [1, 2, 3, 4, 5]
      : [...days[2].matchAll(new RegExp(WEEKDAY_WORD, 'gi'))].map((m) => weekdayIndex(m[1]));
    return { rule: { freq: 'weekly', interval: days[1] ? 2 : 1, daysOfWeek: [...new Set(list)].sort((a, b) => a - b) }, span: spanOf(days) };
  }
  const m = REPEAT.exec(text);
  if (!m) return null;
  const [, other, count, unit, adverb] = m;
  const word = (unit ?? adverb).toLowerCase();
  let interval = count ? parseInt(count, 10) : other ? 2 : 1;
  let freq: RepeatConfig['freq'] = 'weekly';
  if (word === 'day' || word === 'daily') freq = 'daily';
  else if (word === 'fortnight' || word === 'fortnightly') interval *= 2;
  else if (word === 'month' || word === 'monthly') freq = 'monthly';
  else if (word === 'year' || word === 'yearly' || word === 'annually') freq = 'yearly';
  return { rule: { freq, interval: Math.max(1, interval) }, span: spanOf(m) };
}

// How a repeat ends: "until 19 December 2027", "through March 3", "10 times", "for 6 weeks".
function findRepeatEnd(text: string, now: Date): (({ until: string } | { count: number }) & { span: Span }) | null {
  const until = /\b(?:until|till|til|through|thru|ending(?:\s+on)?|ends?(?:\s+on)?)\s+/i.exec(text);
  if (until) {
    const after = until.index + until[0].length;
    const date = findDateCandidates(text.slice(after), now).find((c) => c.index === 0);
    if (date) {
      const y = resolveYear(date.y, date.m, date.d, date.yearExplicit, now);
      return { until: toIso(y, date.m, date.d), span: { start: until.index, end: after + date.length } };
    }
  }
  const times = /\b(?:for\s+)?(\d+)\s+(?:times|occurrences|sessions)\b|\bfor\s+(\d+)\s+(?:days|weeks|months|years)\b/i.exec(text);
  if (times) return { count: Math.max(1, parseInt(times[1] ?? times[2], 10)), span: spanOf(times) };
  return null;
}

// An address the text gives: "at Minervastrasse 65, 8032 Zürich", "Location: 12 Smith St".
// A street needs its number beside it (or a "location:" label), so "meet at the station" or
// "at 2pm" never reads as one. The value runs to a "·", "|", a new line, a link or the end; what
// follows it on the same line before a link (usually the town again) comes out of the title too.
const STREET_WORDS = 'strasse|straße|str\\.?|gasse|weg|platz|allee|street|st\\.?|road|rd\\.?|avenue|ave\\.?|lane|ln\\.?|drive|dr\\.?|boulevard|blvd\\.?|way|place|pl\\.?|court|ct\\.?|terrace|tce\\.?|parade|pde\\.?|highway|hwy\\.?|crescent|cres\\.?|square|sq\\.?';
const ADDRESS_LABEL = /\b(?:location|address|venue|where)\s*:\s*/i;
const ADDRESS_AT = /(?:\bat|@)\s+(?=\S)/gi;
// "Minervastrasse 65", "Rue de Rivoli 12" (a name, then its number) or "12 Smith St" (a number, then a street).
const STREET_NAME_NUMBER = /^(?:[\p{L}][\p{L}.'-]*\s+){0,3}[\p{L}][\p{L}.'-]*\s+\d+[a-z]?\b(?=\s*[,\n·|]|\s*$)/iu;
const NUMBER_STREET = new RegExp(`^\\d+[a-z]?\\s+(?:[\\p{L}][\\p{L}.'-]*\\s+){0,3}(?:${STREET_WORDS})(?=[\\s,]|$)`, 'iu');
const BARE_STREET = new RegExp(`[\\p{L}]+(?:${STREET_WORDS})\\s+\\d+[a-z]?\\b|\\b\\d+[a-z]?\\s+(?:[\\p{L}][\\p{L}.'-]*\\s+){0,3}(?:${STREET_WORDS})(?=[\\s,]|$)`, 'iu');

function findLocation(text: string): { value: string; span: Span } | null {
  const take = (from: number, spanStart: number) => {
    const rest = text.slice(from);
    const stop = rest.search(/\s[·|]\s|\n|https?:\/\/|$/);
    const value = rest.slice(0, stop).replace(/[\s,;.]+$/, '').trim();
    const lineEnd = rest.search(/\n|https?:\/\/|$/);
    return value ? { value, span: { start: spanStart, end: from + Math.max(stop, lineEnd) } } : null;
  };
  const label = ADDRESS_LABEL.exec(text);
  if (label) return take(label.index + label[0].length, label.index);
  for (const m of text.matchAll(ADDRESS_AT)) {
    const from = (m.index ?? 0) + m[0].length;
    const rest = text.slice(from);
    if (STREET_NAME_NUMBER.test(rest) || NUMBER_STREET.test(rest)) return take(from, m.index ?? 0);
  }
  const bare = BARE_STREET.exec(text);
  return bare ? take(bare.index, bare.index) : null;
}

// The first date a rule lands on, on or after `from`: "every 3rd Sunday" with no date given (or
// one the rule doesn't land on) starts on the next 3rd Sunday, since a series' first date always
// counts as one of its dates.
function firstDateOfRule(rule: RepeatRule, from: string): string {
  if (rule.monthWeekday) return firstNthWeekdayFrom(from, rule.monthWeekday);
  const start = new Date(from + 'T00:00:00');
  for (let k = 0; rule.daysOfWeek?.length && k < 7; k++) {
    const d = addDays(start, k);
    if (rule.daysOfWeek.includes(d.getDay())) return toIso(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return from;
}

const allSpans = (re: RegExp, text: string): Span[] =>
  [...text.matchAll(re)]
    .filter((m) => m[0].trim().length > 0)
    .map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));

// What's left around a lifted-out cue: "the tax return is" → "the tax return", "for the report" →
// "the report", "Rent is due" → "Rent".
function tidyTitle(title: string, original: string): string {
  let t = title;
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/\s+(?:is|are|was|will be|due|by|on|at|before|until|of)[\s.,:;-]*$/i, '')
      .replace(/^(?:for|of|to|that|is|are|about)\s+/i, '')
      .trim();
  }
  if (!t) return title;
  // Lifting a leading cue out can leave the title starting lower-case ("Remind me to call Sam").
  return /^\s*[A-Z]/.test(original) && /^[a-z]/.test(t) ? t[0].toUpperCase() + t.slice(1) : t;
}

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

// Kind, in order of how explicitly the text says it:
//   1. deadline — "the deadline for X is…", "due", "submit", "expires", or a date introduced by
//      "by"/"before" ("pay rent by the 1st");
//   2. reminder — "remind me", "don't forget", "remember to", "note to self"…;
//   3. event — a time range, something you attend ("meeting", "dentist"), a journey, a birthday;
//   4. otherwise a reminder (a point in time to be nudged about).
// So "remind me that the deadline for the essay is Friday" is a deadline (a Deadline notifies ahead
// of time anyway), and "remind me to book the flight" is a reminder, not a journey. A best guess
// only — the modal it opens in still has the Event / Reminder / Deadline toggle.
export function inferCalendarItemFromSelection(rawText: string, extraLinks: string[] = [], now: Date = new Date()): InferredCalendarFields {
  // The repeat and its end are read first and blanked out, so "until 19 December" isn't taken as
  // the date and "every 3rd Sunday" isn't taken as next Sunday.
  const repeatMatch = findRepeat(rawText);
  const endMatch = repeatMatch ? findRepeatEnd(rawText, now) : null;
  const ruleSpans = [...(repeatMatch ? [repeatMatch.span] : []), ...(endMatch ? [endMatch.span] : [])];
  const masked = ruleSpans.reduce((t, sp) => blank(t, sp.start, sp.end), rawText);
  const dateMatch = inferDateMatch(masked, now);
  const range = findTimeRange(masked);
  const timeMatch = range ? null : findTimeMatch(masked);
  const fieldSpans = [
    ...ruleSpans, ...findLinkSpans(rawText),
    ...(dateMatch ? [dateMatch] : []), ...(range ? [range.span] : timeMatch ? [timeMatch] : []),
  ];
  const place = findLocation(fieldSpans.reduce((t, sp) => blank(t, sp.start, sp.end), rawText));

  const byDate = !!dateMatch && DEADLINE_DATE_CONNECTOR.test(rawText.slice(0, dateMatch.start));
  const deadlineLead = DEADLINE_LEAD.exec(rawText);
  const deadlineLeadSpan = deadlineLead && deadlineLead[0].trim() ? spanOf(deadlineLead) : null;
  const deadlineIs = deadlineLeadSpan ? null : DEADLINE_IS.exec(rawText) ?? DEADLINE_FOR.exec(rawText);
  const isDeadline = !!deadlineLeadSpan || !!deadlineIs || DEADLINE_WORDS.test(rawText) || byDate;
  const isReminder = REMINDER_WORDS.test(rawText);
  const isBirthday = BIRTHDAY_WORDS.test(rawText);
  const isTravel = TRAVEL_WORDS.test(rawText);
  // An address means somewhere to be, so an event.
  const isEvent = !!range || EVENT_WORDS.test(rawText) || isTravel || isBirthday || !!place;

  const kind: InferredCalendarFields['kind'] = isDeadline ? 'deadline' : isReminder ? 'reminder' : isEvent ? 'event' : 'reminder';
  const eventType: InferredCalendarFields['eventType'] = kind !== 'event' ? 'default' : isBirthday ? 'birthday' : isTravel ? 'travel' : 'default';
  const tentativeSpans = allSpans(TENTATIVE_STRIP, rawText);

  // Everything that ends up in its own field (date, time(s), links, repeat, address) and every
  // phrase that only told us the kind comes out of the title.
  const title = tidyTitle(stripSpans(rawText, [
    ...fieldSpans,
    ...(place ? [place.span] : []),
    ...(deadlineLeadSpan ? [deadlineLeadSpan] : deadlineIs ? [spanOf(deadlineIs)] : []),
    ...allSpans(REMINDER_STRIP, rawText),
    ...tentativeSpans,
    ...allSpans(IMPORTANT_STRIP, rawText),
  ]), rawText);

  const links = [...new Set([...extractUrls(rawText), ...extraLinks])];
  // A birthday is all-day and comes round every year, whatever else the text says.
  const birthday = eventType === 'birthday';
  const rule: RepeatRule | null = birthday ? { freq: 'yearly', interval: 1 } : repeatMatch?.rule ?? null;
  const repeat: RepeatConfig | null = rule && {
    ...rule,
    endKind: endMatch ? ('until' in endMatch ? 'until' : 'count') : 'forever',
    count: endMatch && 'count' in endMatch ? endMatch.count : null,
    until: endMatch && 'until' in endMatch ? endMatch.until : null,
  };
  const today = toIso(now.getFullYear(), now.getMonth(), now.getDate());
  const date = rule && (rule.monthWeekday || (rule.daysOfWeek?.length && !dateMatch))
    ? firstDateOfRule(rule, dateMatch?.iso ?? today)
    : dateMatch?.iso ?? null;
  const location = place?.value ?? (kind === 'event' ? links[0] ?? null : null);

  return {
    title,
    kind,
    date,
    startTime: birthday ? null : range?.start ?? timeMatch?.time ?? null,
    endTime: kind === 'event' && !birthday ? range?.end ?? null : null,
    location,
    notes: links.filter((l) => l !== location).join('\n') || null,
    links,
    eventType,
    tentative: tentativeSpans.length > 0,
    important: IMPORTANT_WORDS.test(rawText),
    repeat,
  };
}

// The first date in a piece of text ("1 October 2026", "yesterday", "next Friday", "15/3/2027"),
// as YYYY-MM-DD, or null: the same reading every text reader here uses (the date calculator's
// magic wand, utils/dateCalc.ts).
export function readDate(text: string, now: Date = new Date()): string | null {
  return inferDateMatch(text, now)?.iso ?? null;
}
