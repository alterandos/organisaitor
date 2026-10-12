// Non-AI acronym inference: finds what an acronym stands for in the text around it, rules only.
//
// The matching is Schwartz & Hearst's algorithm ("A simple algorithm for identifying
// abbreviation definitions in biomedical text", 2003), the standard rules-based method:
// the acronym's letters are matched right to left against the candidate words, each letter
// anywhere in a word (so the X of ASX can come from "eXchange"), except the first, which must
// start a word. The fewest words that match are kept, so "Trading on the Australian Stock
// Exchange (ASX)" gives "Australian Stock Exchange", not the whole sentence. A candidate has at
// most min(letters + 5, letters × 2) words.
//
// Where the pair is looked for, most certain first:
//   1. "Long form (TERM)"                    4. "TERM - long form", "TERM: …", "TERM stands for …"
//   2. "TERM (long form)"                    5. "Long form - TERM"
//   3. the selection itself holds both (either order, with or without brackets)
// Nothing found means `expansion: null`: inference never fills a field it isn't sure of. The
// exception is a selection of plain words with no acronym anywhere: the user is naming the long
// form, so its acronym is made from the words' first letters (deduceAcronym).

export interface AcronymInferenceResult {
  term: string;               // the acronym itself, e.g. "ASX"
  expansion: string | null;   // what it stands for, when confidently found
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isAlnum = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const stripPunct = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

// The letters and digits an acronym is spelt with: "U.S.A." → "usa", "COVID-19" → "covid19".
const acronymLetters = (term: string) => term.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Shaped like an acronym: 2–12 characters, at least two capitals, no run of 3+ lowercase
// letters (so "DoD" and "COVID-19" are, "McDonald" isn't).
export function looksLikeAcronym(word: string): boolean {
  const w = stripPunct(word);
  return w.length >= 2 && w.length <= 12 && (w.match(/\p{Lu}/gu) ?? []).length >= 2 && !/\p{Ll}{3}/u.test(w);
}

// One candidate: can the acronym's letters be found in order in `long`, the first within its
// first word (usually its first letter; "eXtensible Markup Language" is the exception)? Returns
// how many matched letters begin a word, using the alignment with the most (so I of API comes
// from "Interface", not from inside "Application"), or -1 for no match. At least two must begin
// a word, so one long word never passes for a whole phrase.
function wordStartScore(short: string, long: string): number {
  return align(short, long)?.score ?? -1;
}

// The alignment itself: which characters of `long` the acronym's letters are (positions in
// `long`), and how many of them begin a word.
function align(short: string, long: string): { score: number; positions: number[] } | null {
  const text = long.toLowerCase();
  type Best = { score: number; positions: number[] } | null;
  const memo = new Map<number, Best>();
  const go = (si: number, from: number): Best => {
    if (si === short.length) return { score: 0, positions: [] };
    const key = si * 10000 + from;
    if (memo.has(key)) return memo.get(key)!;
    let best: Best = null;
    for (let li = from; li < text.length; li++) {
      if (text[li] !== short[si]) continue;
      const rest = go(si + 1, li + 1);
      if (!rest) continue;
      const score = rest.score + (isAlnum(text[li - 1]) ? 0 : 1);
      if (!best || score > best.score) best = { score, positions: [li, ...rest.positions] };
    }
    memo.set(key, best);
    return best;
  };
  const start = text.search(/[\p{L}\p{N}]/u);
  if (start < 0) return null;
  const firstWordEnd = text.slice(start).search(/[^\p{L}\p{N}]/u);
  const end = firstWordEnd < 0 ? text.length : start + firstWordEnd;
  let best: Best = null;
  for (let li = start; li < end; li++) {
    if (text[li] !== short[0]) continue;
    const rest = go(1, li + 1);
    if (!rest) continue;
    const score = rest.score + (li === start ? 1 : 0);
    if (!best || score > best.score) best = { score, positions: [li, ...rest.positions] };
  }
  return best && best.score >= Math.min(2, short.length) ? best : null;
}

// Which characters of `expansion` spell `term` (for the acronym card to highlight them):
// positions in `expansion`, or null when its letters don't spell it.
export function acronymLetterPositions(term: string, expansion: string): number[] | null {
  const short = acronymLetters(term);
  return short.length >= 2 ? align(short, expansion)?.positions ?? null : null;
}

// The best of the candidates: most word beginnings matched, then the fewest words.
function bestCandidate(short: string, candidates: string[]): string | null {
  let best: { text: string; score: number } | null = null;
  for (const text of candidates) {
    if (acronymLetters(text) === short) continue;
    const score = wordStartScore(short, text);
    if (score >= 0 && (!best || score > best.score)) best = { text, score };
  }
  return best ? tidy(best.text) : null;
}

const maxWords = (n: number) => Math.min(n + 5, n * 2);
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const tidy = (text: string) => text.trim().replace(/^[\s,;:(\-–—]+|[\s.,;:)\-–—]+$/g, '').trim();

// The long form that ENDS a stretch of text ("…on the Australian Stock Exchange" + "(ASX)").
export function longFormBefore(term: string, text: string): string | null {
  const short = acronymLetters(term);
  if (short.length < 2) return null;
  const ws = words(text);
  const ks = Array.from({ length: Math.min(ws.length, maxWords(short.length)) }, (_, i) => i + 1);
  return bestCandidate(short, ks.map((k) => ws.slice(-k).join(' ')));
}

// The long form that STARTS a stretch of text ("ASX - " + "Australian Stock Exchange is…").
export function longFormAfter(term: string, text: string): string | null {
  const short = acronymLetters(term);
  if (short.length < 2) return null;
  const ws = words(text);
  const ks = Array.from({ length: Math.min(ws.length, maxWords(short.length)) }, (_, i) => i + 1);
  return bestCandidate(short, ks.map((k) => ws.slice(0, k).join(' ')));
}

// Clauses end at sentence punctuation and brackets; a long form never crosses one.
const tailOfClause = (text: string) => text.split(/[.;!?()\n]/).pop() ?? '';
const headOfClause = (text: string) => text.split(/[.;!?(),\n]/)[0] ?? '';

// Every place `term` stands alone in the context, tried in turn until one gives a long form.
function findInContext(term: string, context: string): string | null {
  if (!acronymLetters(term)) return null;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'gu');
  const hits = [...context.matchAll(re)].map((m) => m.index ?? 0);
  const tries: ((at: number) => string | null)[] = [
    // 1. Long form (TERM)
    (at) => /\(\s*$/.test(context.slice(0, at)) && /^\s*\)/.test(context.slice(at + term.length))
      ? longFormBefore(term, tailOfClause(context.slice(0, at).replace(/\(\s*$/, ''))) : null,
    // 2. TERM (long form)
    (at) => {
      const m = context.slice(at + term.length).match(/^\s*\(([^()]{1,160})\)/);
      return m ? longFormAfter(term, m[1]) : null;
    },
    // 4. TERM - long form / TERM: … / TERM stands for …
    (at) => {
      const m = context.slice(at + term.length).match(/^\s*(?:[:=\-–—]|,?\s*(?:stands for|is short for|means|short for)\b)\s*(.*)$/is);
      return m ? longFormAfter(term, headOfClause(m[1])) : null;
    },
    // 5. Long form - TERM
    (at) => {
      const m = context.slice(0, at).match(/^(.*?)\s*[:=\-–—]\s*$/s);
      return m ? longFormBefore(term, tailOfClause(m[1])) : null;
    },
  ];
  for (const attempt of tries) for (const at of hits) {
    const found = attempt(at);
    if (found) return found;
  }
  return null;
}

// Main entry point. `selectedText` is what was highlighted; `contextText` is its paragraph.
export function inferAcronymFromSelection(selectedText: string, contextText: string): AcronymInferenceResult {
  const trimmed = selectedText.trim();
  const ws = words(trimmed);
  if (ws.length === 0) return { term: '', expansion: null };

  // One word: it's the acronym (brackets dropped); the context says what it stands for.
  if (ws.length === 1) {
    const term = stripPunct(trimmed) || trimmed;
    return { term, expansion: findInContext(term, contextText) };
  }

  // Several words with an acronym among them: the acronym, and the rest of the selection as
  // its long form if the letters match (either side of it), else the context's.
  const candidates = ws.map((w, i) => ({ w: stripPunct(w), i })).filter(({ w }) => looksLikeAcronym(w));
  for (const { w, i } of [...candidates].reverse()) {
    const expansion = longFormBefore(w, ws.slice(0, i).join(' ')) ?? longFormAfter(w, ws.slice(i + 1).join(' '));
    if (expansion) return { term: w, expansion };
  }
  for (const { w } of candidates) {
    const expansion = findInContext(w, contextText);
    if (expansion) return { term: w, expansion };
  }
  if (candidates.length) return { term: candidates[candidates.length - 1].w, expansion: null };

  // Only the long form was selected: look for its acronym in brackets straight after it, or
  // after a dash or colon straight before it.
  const at = contextText.indexOf(trimmed);
  if (at >= 0) {
    const after = contextText.slice(at + trimmed.length).match(/^\s*\(\s*([^()\s]{2,12})\s*\)/);
    const before = contextText.slice(0, at).match(/(?<![\p{L}\p{N}])([^\s()]{2,12})\s*(?:[:=\-–—]|\()\s*$/u);
    for (const term of [after?.[1], before?.[1]]) {
      if (term && looksLikeAcronym(term) && longFormAfter(term, trimmed) === tidy(trimmed)) return { term, expansion: tidy(trimmed) };
    }
  }
  // Nothing to find: the selection is the long form, and its acronym is made from it.
  const made = deduceAcronym(trimmed);
  return made ? { term: made, expansion: tidy(trimmed) } : { term: trimmed, expansion: null };
}

// Small words a made-up acronym leaves out ("Department of Defence" → DD), unless that would
// leave fewer than two letters.
const SMALL_WORDS = new Set(['of', 'the', 'and', 'for', 'in', 'on', 'a', 'an', 'to', 'at', 'or', 'by', 'with', '&']);

// An acronym made from a phrase: the first letter of each word, in capitals ("apple banana
// carrot" → ABC). Null for fewer than two words.
export function deduceAcronym(phrase: string): string | null {
  const ws = words(phrase).map(stripPunct).filter(Boolean);
  if (ws.length < 2) return null;
  const big = ws.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  const use = big.length >= 2 ? big : ws;
  return use.map((w) => [...w][0].toUpperCase()).join('');
}

// Text that has just been closed with "Long form (TERM)": the acronym, its long form, and where
// the acronym starts in `text`. For offering to record it as you type (AcronymOffer.ts).
export function acronymPairAtEnd(text: string): { term: string; expansion: string; termFrom: number } | null {
  const m = text.match(/\(\s*([^()\s]{2,12})\s*\)$/u);
  if (!m || m.index === undefined || !looksLikeAcronym(m[1])) return null;
  const expansion = longFormBefore(m[1], tailOfClause(text.slice(0, m.index)));
  return expansion ? { term: m[1], expansion, termFrom: m.index + m[0].indexOf(m[1]) } : null;
}
