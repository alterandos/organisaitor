import type { AnyNoteObjectKind, NoteBlockKind, PickableKind } from './types';
import { isBlockKind } from './types';
import { reminderKind } from './reminderKind';
import { eventKind } from './eventKind';
import { deadlineKind } from './deadlineKind';
import { NOTE_BLOCK_KINDS } from './blockKinds';

// THE registry of what `\` can create. A new kind is one entry here (plus an ARTIFACT_TYPES entry
// for its targetType, if it doesn't have one yet — a pattern test checks). Note blocks (things
// that live in the note itself) have their own registry, blockKinds.ts.
export const NOTE_OBJECT_KINDS: AnyNoteObjectKind[] = [reminderKind, eventKind, deadlineKind];

const keywordsOf = (k: PickableKind) => [k.id, ...k.aliases].map((w) => w.toLowerCase());

// The kind a whole keyword names exactly (id or alias), if any.
export function exactKind<K extends PickableKind>(word: string, kinds: K[]): K | null;
export function exactKind(word: string): AnyNoteObjectKind | null;
export function exactKind(word: string, kinds: PickableKind[] = NOTE_OBJECT_KINDS): PickableKind | null {
  const w = word.toLowerCase();
  return kinds.find((k) => keywordsOf(k).includes(w)) ?? null;
}

// Kinds matching a partly typed keyword, best first: an exact keyword, then a keyword it starts,
// then a word of the label it starts; registry order within each.
export function matchKinds<K extends PickableKind>(word: string, kinds: K[]): K[];
export function matchKinds(word: string): AnyNoteObjectKind[];
export function matchKinds(word: string, kinds: PickableKind[] = NOTE_OBJECT_KINDS): PickableKind[] {
  const w = word.toLowerCase();
  if (!w) return [...kinds];
  const score = (k: PickableKind): number => {
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

// What the menu offers for a partly typed keyword: the matching objects, then the matching blocks
// (the menu shows them as two groups, in this order).
export function matchPickable(word: string, kinds: AnyNoteObjectKind[] = NOTE_OBJECT_KINDS, blocks: NoteBlockKind[] = NOTE_BLOCK_KINDS): PickableKind[] {
  return [...matchKinds(word, kinds), ...matchKinds(word, blocks)];
}

// The kind a keyword followed by a space chooses: one it names exactly, or the only one it starts.
// That's what lets `\rem call mum` and `\tl ` work without Tab.
export function chosenKind(word: string, kinds: AnyNoteObjectKind[] = NOTE_OBJECT_KINDS, blocks: NoteBlockKind[] = NOTE_BLOCK_KINDS): PickableKind | null {
  const all: PickableKind[] = [...kinds, ...blocks];
  const matches = matchKinds(word, all);
  return exactKind(word, all) ?? (matches.length === 1 ? matches[0] : null);
}

// What the text after a `\` means so far.
// - picking:   still choosing a kind (no space typed yet); `matches` (objects, then blocks) may be
//              empty while a typo is being corrected.
// - composing: an object kind is chosen (its keyword, then a space); `body` is everything after
//              that space, `keywordLength` the keyword plus that space.
// - null:      not an object after all (a space after something that names no single kind). A
//              block kind's keyword and a space never gets here as text: the space inserts the
//              block (NoteObjectTrigger's handleTextInput), so if it does arrive (pasted) it's text.
export type ObjectQuery =
  | { phase: 'picking'; word: string; matches: PickableKind[] }
  | { phase: 'composing'; kind: AnyNoteObjectKind; keywordLength: number; body: string };

export function interpretQuery(query: string, kinds: AnyNoteObjectKind[] = NOTE_OBJECT_KINDS, blocks: NoteBlockKind[] = NOTE_BLOCK_KINDS): ObjectQuery | null {
  if (query.includes('\\') || query.includes('\n')) return null;
  const space = query.search(/\s/);
  if (space < 0) return { phase: 'picking', word: query, matches: matchPickable(query, kinds, blocks) };
  if (space === 0) return null;
  const kind = chosenKind(query.slice(0, space), kinds, blocks);
  if (!kind || isBlockKind(kind)) return null;
  return { phase: 'composing', kind, keywordLength: space + 1, body: query.slice(space + 1) };
}
