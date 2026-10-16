// Spotting, as it's typed, writing that is really a note block (asked for 2026-10-16): a quotation,
// "there are three types of rock", "the pros and cons of renting". Pure rules over the text of a
// line; the note editor offers the block through its "offer as you type" chip
// (NoteEditor/extensions/BlockOffers.ts). Simple text patterns for now: an AI reading of the text
// is a later idea (BACKLOG.md "Detecting blocks with AI").

const COUNT_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  several: 3, many: 3, 'a few': 3, 'a number of': 3, various: 3, different: 3,
};
const COUNT = `(\\d{1,2}|${Object.keys(COUNT_WORDS).map((w) => w.replace(' ', '\\s+')).join('|')})`;
const KINDS = '(?:types|kinds|sorts|categories|varieties|forms|classes)';
const QUALIFIER = '(?:(?:main|different|basic|key|major|distinct|common)\\s+)?';
const SUBJECT = '([^:.;!?]{1,60}?)';

const MAX_PARTS = 8;
const countOf = (word: string): number => {
  const n = /^\d+$/.test(word) ? parseInt(word, 10) : COUNT_WORDS[word.toLowerCase().replace(/\s+/g, ' ')] ?? 3;
  return Math.max(2, Math.min(MAX_PARTS, n));
};

// The subject as a block's heading: no leading article, the first letter a capital.
export const asHeading = (text: string): string => {
  const t = text.trim().replace(/^(?:the|a|an)\s+/i, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// ── Quote ────────────────────────────────────────────────────────────────────

export interface QuoteFound { quote: string; who: string }

const CLOSE_TO_OPEN: Record<string, string> = { '”': '“', '"': '"', '’': '‘', "'": "'" };
const SAID = '(?:said|says|wrote|writes|remarked|remarks|noted|notes|observed|observes|asked|asks|declared|declares|put\\s+it|puts\\s+it|told\\s+us|tweeted)';
const ATTRIBUTION = new RegExp(`^(?:as\\s+)?(.{1,60}?)\\s*,?\\s+(?:(?:once|famously|also|then|later|rightly)\\s+)?${SAID}\\s*[,:]?$`, 'i');
const WHO_COLON = /^(.{1,60}?):$/;

// A line that is nothing but a quotation, maybe with who said it before it ("Ada once said
// 'the engine might compose music'", "Einstein: “…”"), just closed by its last quote mark.
export function quoteJustTyped(line: string): QuoteFound | null {
  const close = line.slice(-1);
  const open = CLOSE_TO_OPEN[close];
  if (!open) return null;
  const body = line.slice(0, -1);
  let at = -1;
  if (open === "'" || open === '"') {
    // A straight quote opens at the start of a word: the first one after a space (or the start).
    for (let i = 0; i < body.length; i++) if (body[i] === open && (i === 0 || /[\s:(]/.test(body[i - 1]))) { at = i; break; }
  } else at = body.lastIndexOf(open);
  if (at < 0) return null;
  const quote = body.slice(at + 1).trim();
  if (quote.split(/\s+/).length < 3) return null;
  const before = body.slice(0, at).trim();
  if (!before) return { quote, who: '' };
  const m = ATTRIBUTION.exec(before) ?? WHO_COLON.exec(before);
  if (!m) return null;
  const who = m[1].trim().replace(/,$/, '');
  if (!who || who.split(/\s+/).length > 8) return null;
  return { quote, who };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PartsFound { from: number; to: number; subject: string; count: number }

const TYPES_PATTERNS: { re: RegExp; count: number; subject: number }[] = [
  // "There are three types of rock:"
  { re: new RegExp(`\\bthere\\s+are\\s+${COUNT}\\s+${QUALIFIER}${KINDS}\\s+of\\s+${SUBJECT}\\s*[:.]$`, 'i'), count: 1, subject: 2 },
  // "The three types of rock are:"
  { re: new RegExp(`\\bthe\\s+${COUNT}\\s+${QUALIFIER}${KINDS}\\s+of\\s+${SUBJECT}\\s+are\\s*[:.]$`, 'i'), count: 1, subject: 2 },
  // "Rocks can be divided into three types:"
  { re: new RegExp(`(?<=^|[.!?]\\s+)${SUBJECT}\\s+(?:can\\s+be|are|is)\\s+(?:divided|classified|split|grouped|categori[sz]ed|sorted|broken\\s+down)\\s+into\\s+${COUNT}\\s+${QUALIFIER}${KINDS}\\s*[:.]$`, 'i'), count: 2, subject: 1 },
];

// "There are three types of rock:" (and the like), just ended with a colon or full stop: the kinds
// of what, how many, and where the words are in `before` (the punctuation left out).
export function typesJustTyped(before: string): PartsFound | null {
  for (const p of TYPES_PATTERNS) {
    const m = p.re.exec(before);
    if (!m) continue;
    const subject = asHeading(m[p.subject]);
    if (!subject) continue;
    return { from: m.index + (m[0].length - m[0].trimStart().length), to: before.length - 1, subject, count: countOf(m[p.count]) };
  }
  return null;
}

// ── Pros and cons ────────────────────────────────────────────────────────────

const PROS_CONS = new RegExp(`\\b(?:the\\s+)?(?:pros\\s+and\\s+cons|advantages\\s+and\\s+disadvantages|benefits\\s+and\\s+drawbacks|upsides\\s+and\\s+downsides|strengths\\s+and\\s+weaknesses)\\s+of\\s+${SUBJECT}\\s*[:.]$`, 'i');

// "The pros and cons of renting:" (and the like), just ended with a colon or full stop.
export function prosConsJustTyped(before: string): Omit<PartsFound, 'count'> | null {
  const m = PROS_CONS.exec(before);
  if (!m) return null;
  const subject = asHeading(m[1]);
  return subject ? { from: m.index, to: before.length - 1, subject } : null;
}
