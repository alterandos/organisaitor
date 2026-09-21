const STOP_WORDS = new Set((
  'a about above after again all also am an and any are as at be because been before being below ' +
  'between both but by can could did do does doing down during each few for from further get got had ' +
  'has have having he her here hers him his how i if in into is it its just like make me more most ' +
  'my need new no nor not now of off on once only or other our out over own per same she should so ' +
  'some such than that the their them then there these they this those through to too under until up ' +
  'very want was we were what when where which while who whom why will with would you your ' +
  'todo task tasks item items thing things'
).split(' '));

const MAX_KEYWORDS = 8;

// A word's crude stem, used only for substring matching against note text so "exchanges" finds
// "exchange" and "meeting" finds "meet"/"meetings". Deliberately not a real stemmer: it can only
// strip a trailing s / ing / ed and never leaves fewer than 4 letters.
export function stemForMatch(word: string): string {
  for (const suffix of ['ing', 'ed', 's']) {
    if (word.endsWith(suffix) && !word.endsWith('ss') && word.length - suffix.length >= 4) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

// The distinctive words of a title, lowercase, in order of appearance — stop-words, numbers-only
// tokens and anything under three letters dropped, duplicates removed, capped at MAX_KEYWORDS.
export function extractKeywords(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOP_WORDS.has(raw) || /^\p{N}+$/u.test(raw)) continue;
    if (!out.includes(raw)) out.push(raw);
    if (out.length === MAX_KEYWORDS) break;
  }
  return out;
}
