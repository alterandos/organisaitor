import type { AnyNoteObjectKind } from './types';
import { reminderKind } from './reminderKind';
import { eventKind } from './eventKind';
import { deadlineKind } from './deadlineKind';

// THE registry of what `\` can create. A new kind is one entry here (plus an ARTIFACT_TYPES entry
// for its targetType, if it doesn't have one yet — a pattern test checks).
export const NOTE_OBJECT_KINDS: AnyNoteObjectKind[] = [reminderKind, eventKind, deadlineKind];

const keywordsOf = (k: AnyNoteObjectKind) => [k.id, ...k.aliases].map((w) => w.toLowerCase());

// The kind a whole keyword names exactly (id or alias), if any.
export function exactKind(word: string, kinds: AnyNoteObjectKind[] = NOTE_OBJECT_KINDS): AnyNoteObjectKind | null {
  const w = word.toLowerCase();
  return kinds.find((k) => keywordsOf(k).includes(w)) ?? null;
}

// Kinds matching a partly typed keyword, best first: an exact keyword, then a keyword it starts,
// then a word of the label it starts; registry order within each.
export function matchKinds(word: string, kinds: AnyNoteObjectKind[] = NOTE_OBJECT_KINDS): AnyNoteObjectKind[] {
  const w = word.toLowerCase();
  if (!w) return [...kinds];
  const score = (k: AnyNoteObjectKind): number => {
    const keys = keywordsOf(k);
    if (keys.includes(w)) return 0;
    if (keys.some((key) => key.startsWith(w))) return 1;
    if (k.label.toLowerCase().split(/\s+/).some((part) => part.startsWith(w))) return 2;
    return -1;
  };
  return kinds
    .map((k, i) => ({ k, i, s: score(k) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.k);
}

// What the text after a `\` means so far.
// - picking:   still choosing a kind (no space typed yet); `matches` may be empty while a typo is
//              being corrected.
// - composing: a kind is chosen (its keyword, then a space); `body` is everything after that
//              space, `keywordLength` the keyword plus that space.
// - null:      not an object after all (a space after something that names no single kind).
export type ObjectQuery =
  | { phase: 'picking'; word: string; matches: AnyNoteObjectKind[] }
  | { phase: 'composing'; kind: AnyNoteObjectKind; keywordLength: number; body: string };

export function interpretQuery(query: string, kinds: AnyNoteObjectKind[] = NOTE_OBJECT_KINDS): ObjectQuery | null {
  if (query.includes('\\') || query.includes('\n')) return null;
  const space = query.search(/\s/);
  if (space < 0) return { phase: 'picking', word: query, matches: matchKinds(query, kinds) };
  if (space === 0) return null;
  const word = query.slice(0, space);
  const matches = matchKinds(word, kinds);
  // A unique prefix counts as chosen (`\rem call mum`), so the space doesn't have to wait for Tab.
  const kind = exactKind(word, kinds) ?? (matches.length === 1 ? matches[0] : null);
  if (!kind) return null;
  return { phase: 'composing', kind, keywordLength: space + 1, body: query.slice(space + 1) };
}
