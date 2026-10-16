// The Unsure flag's text rules (NoteEditor/extensions/UnsureFlag.ts), kept pure so they're tested
// without an editor: which sentence a `(?)` or a `\unsure` flags.

const ENDS_SENTENCE = /[.!?…]/;
const WORD = /[\p{L}\p{N}]/u;

// The sentence that ends at `end` in `text` (a paragraph's text up to where `(?)` or `\unsure` was
// typed): back to the end of the sentence before it, or the start. Spaces either side are left out;
// a full stop at its own end is kept. Null when there are no words there.
export function sentenceEndingAt(text: string, end: number): { from: number; to: number } | null {
  let to = end;
  while (to > 0 && /\s/.test(text[to - 1])) to--;
  let from = to;
  // Its own closing mark (and any quote or bracket after it) is part of it, not the sentence before.
  while (from > 0 && /[.!?…"'”’)\]]/.test(text[from - 1])) from--;
  while (from > 0 && !(ENDS_SENTENCE.test(text[from - 1]) && (from === to || /\s/.test(text[from])))) from--;
  while (from < to && /\s/.test(text[from])) from++;
  return WORD.test(text.slice(from, to)) ? { from, to } : null;
}

// `(?)` just typed at the end of `before`: where it is, and the sentence before it.
export function findUnsureTrigger(before: string): { sentence: { from: number; to: number }; trigger: { from: number; to: number } } | null {
  if (!before.endsWith('(?)')) return null;
  const tFrom = before.length - 3;
  let gapFrom = tFrom;
  while (gapFrom > 0 && /[^\S\n]/.test(before[gapFrom - 1])) gapFrom--;
  const sentence = sentenceEndingAt(before, tFrom);
  if (!sentence) return null;
  // The `(?)` and the spaces before it go; the sentence keeps its own punctuation.
  return { sentence, trigger: { from: Math.max(gapFrom, sentence.to), to: before.length } };
}

// The question a flagged passage becomes: its words, ending in a question mark, for the person to
// reword ("It ended in 1920." → "It ended in 1920?").
export function asQuestion(passage: string): string {
  const t = passage.trim().replace(/[.!…;:,]+$/, '').trim();
  return t.endsWith('?') ? t : `${t}?`;
}
