import { EMOJI_SET } from '@/config/emojiSet';
import { exactChar, findCharTrigger, matchChars, type CharMatch, type TextShortcut } from './charSets';

// `:name:` for emoji (2026-11-11, as Slack, Signal and WhatsApp do: `:joy:` → 😂), beside `//name`
// for characters, through the same list under the cursor and the same keys. The list opens after
// a colon at the start of a word and two letters (so `:o`, `10:30` and "Name: value" never open
// it); the closing colon puts the emoji in. The emoji and their names are the icon picker's set
// (config/emojiSet.ts); the person's own are their typing shortcuts written `:name:` (Settings →
// Typing shortcuts), offered first. Only this file and charSets.ts decide what a trigger is.

export const EMOJI_TRIGGER = ':';
const NAME = /^[a-z0-9_+-]{2,20}$/;
const MAX_SHOWN = 8;

export function findEmojiTrigger(before: string): { start: number; query: string } | null {
  const m = /(^|[\s([{"'“‘«]):([a-z0-9_+-]{2,20})$/.exec(before);
  return m ? { start: m.index + m[1].length, query: m[2] } : null;
}

const own = (list: readonly TextShortcut[]) =>
  list.filter((s) => s.typed.length > 2 && s.typed.startsWith(':') && s.typed.endsWith(':') && NAME.test(s.typed.slice(1, -1).toLowerCase()))
    .map((s) => ({ name: s.typed.slice(1, -1).toLowerCase(), char: s.text }));

const ALL = Object.values(EMOJI_SET).flat().map((e) => ({ char: e.emoji, names: e.words.split(' ') }));

// The emoji whose names start with what's typed: the person's own first, then a name that is
// exactly it, then the rest in the set's order.
export function matchEmoji(query: string, list: readonly TextShortcut[]): CharMatch[] {
  const q = query.toLowerCase();
  const mine = own(list).filter((s) => s.name.startsWith(q)).map((s) => ({ char: s.char, label: `:${s.name}:` }));
  const exact: CharMatch[] = [];
  const rest: CharMatch[] = [];
  for (const e of ALL) {
    const name = e.names.find((n) => n === q) ?? e.names.find((n) => n.startsWith(q));
    if (!name) continue;
    (name === q ? exact : rest).push({ char: e.char, label: `:${name}:` });
  }
  return [...mine, ...exact, ...rest].slice(0, MAX_SHOWN);
}

// What's being typed that a list is offered for: `//name` (characters) or `:name` (emoji).
export function typingTrigger(before: string, list: readonly TextShortcut[]): { start: number; matches: CharMatch[] } | null {
  const c = findCharTrigger(before);
  if (c) return { start: c.start, matches: matchChars(c.query) };
  // No list for a colon that names no emoji (`:30`): it's just text.
  const e = findEmojiTrigger(before);
  const matches = e ? matchEmoji(e.query, list) : [];
  return e && matches.length ? { start: e.start, matches } : null;
}

// A name just finished (`before` ends with what finishes it): `//name` and a space becomes the
// character and the space; `:name:` becomes the emoji. Null when it names nothing.
export function typedWhole(before: string, list: readonly TextShortcut[]): { start: number; char: string } | null {
  if (before.endsWith(' ')) {
    const t = findCharTrigger(before.slice(0, -1));
    const ch = t && exactChar(t.query);
    if (t && ch) return { start: t.start, char: `${ch} ` };
  }
  if (before.endsWith(':')) {
    const t = findEmojiTrigger(before.slice(0, -1));
    if (t) {
      const q = t.query.toLowerCase();
      const mine = own(list).find((s) => s.name === q);
      const hit = mine?.char ?? ALL.find((e) => e.names.includes(q))?.char;
      if (hit) return { start: t.start, char: hit };
    }
  }
  return null;
}
