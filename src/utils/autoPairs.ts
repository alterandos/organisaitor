// Brackets and quotes that close themselves, as in a code editor (CLAUDE.md "Brackets and quotes
// close themselves", adopted 2026-11-02): THE rules, for the note editor (NoteEditor/extensions/
// AutoBrackets.ts) and a Glossary card's fields (NoteEditor/extensions/cardFieldPairs.ts). Typing an
// opening mark puts in the pair with the cursor between, only before a space, the end of the line or
// closing punctuation (so one typed in front of a word stays one). A quote has one more rule: not
// straight after a letter or digit, or the same quote, so "don't" and "students'" keep one mark.

export const PAIRS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
export const QUOTES: ReadonlySet<string> = new Set(['"', "'"]);
export const CLOSES: ReadonlySet<string> = new Set(Object.values(PAIRS));
const CLOSE_BEFORE = /^$|^[\s)\]}.,;:!?'"”’]/;
const WORD_BEFORE = /[\p{L}\p{N}]/u;

// Whether typing `open` between the character `before` and the character `after` (either may be
// '') puts in the pair.
export function opensPair(open: string, before: string, after: string): boolean {
  if (!PAIRS[open] || !CLOSE_BEFORE.test(after)) return false;
  return !(QUOTES.has(open) && (WORD_BEFORE.test(before) || before === open));
}
