// A Fact's headline, worked out from the fact itself (agreed with the user 2026-11-03), so a fact
// reads well as a chip, in the Glossary and in a list without anyone having to write one. In order:
//   1. the title it came with (a Wikipedia article's, for the Today card's facts);
//   2. a Glossary term it mentions, as a whole word (the first mentioned);
//   3. its subject: the words before its first main verb ("Honey never spoils" → "Honey");
//   4. its first few words.
// Pure. An AI reader could replace steps 2–4 later (BACKLOG.md "Magic wand readers through the AI").

const MAX_SUBJECT_WORDS = 6;
const FIRST_WORDS = 5;
const MAX_LENGTH = 60;

// Words that start a sentence's predicate: forms of be / have / do, the modals, frequency adverbs
// that come before the verb ("never", "always"), and a few common verbs facts are told with.
const PREDICATE = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'does', 'do', 'did',
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'never', 'always', 'often', 'usually', 'sometimes', 'rarely', 'only', 'also', 'still', 'once',
  'became', 'becomes', 'contains', 'contain', 'makes', 'made', 'lives', 'lived', 'grows', 'grew',
  'takes', 'took', 'covers', 'covered', 'holds', 'held', 'produces', 'produced', 'weighs', 'weighed',
  'invented', 'discovered', 'founded', 'built', 'wrote', 'won', 'died', 'born', 'began', 'begins',
  'lasted', 'lasts', 'means', 'meant', 'remains', 'remained', 'reaches', 'reached', 'uses', 'used',
]);

const LEADING_ARTICLE = /^(the|a|an)\s+/i;
const clip = (s: string) => (s.length > MAX_LENGTH ? `${s.slice(0, MAX_LENGTH - 1).trimEnd()}…` : s);
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[\s,;:.!?]+$/, '');
const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function factHeadline(statement: string, { title, terms = [] }: { title?: string | null; terms?: readonly string[] } = {}): string {
  if (title?.trim()) return clip(tidy(title));
  const text = tidy(statement);
  if (!text) return '';
  const lower = text.toLowerCase();
  // The term mentioned first (a fact usually opens with what it's about); the longer one where two start together.
  const at = (t: string) => lower.search(new RegExp(`(?<![\\p{L}\\p{N}])${t.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u'));
  const mentioned = terms
    .filter((t) => t.trim().length > 1)
    .map((t) => ({ t: t.trim(), i: at(t) }))
    .filter((m) => m.i >= 0)
    .sort((a, b) => a.i - b.i || b.t.length - a.t.length)[0];
  if (mentioned) return clip(mentioned.t);
  const words = text.split(' ');
  const verbAt = words.findIndex((w, i) => i > 0 && PREDICATE.has(w.toLowerCase().replace(/[^\p{L}]/gu, '')));
  if (verbAt > 0 && verbAt <= MAX_SUBJECT_WORDS) {
    const subject = tidy(words.slice(0, verbAt).join(' ')).replace(LEADING_ARTICLE, '');
    if (subject) return clip(capitalise(subject));
  }
  const first = words.slice(0, FIRST_WORDS).join(' ');
  return clip(words.length > FIRST_WORDS ? `${tidy(first)}…` : tidy(first));
}

// A quote as selected: its words and who said it, when the selection names them ("“Stay hungry.” —
// Steve Jobs", "Steve Jobs: “Stay hungry.”"). The quotation marks come off.
export function splitQuote(selected: string): { text: string; who: string } {
  const t = selected.trim().replace(/\s+/g, ' ');
  const after = /^["“'‘](.+?)["”'’][,.]?\s*[—–-]\s*(.{1,60})$/.exec(t);
  if (after) return { text: after[1].trim(), who: after[2].trim() };
  const before = /^([^:“"]{1,60}):\s*["“'‘](.+)["”'’]$/.exec(t);
  if (before) return { text: before[2].trim(), who: before[1].trim() };
  return { text: t.replace(/^["“'‘]+|["”'’]+$/g, '').trim(), who: '' };
}

// A Quote's headline: who said it and the quote's opening words ("Einstein: Imagination is more
// important…"), or the opening words alone.
const QUOTE_WORDS = 6;
export function quoteHeadline(text: string, who = ''): string {
  const words = tidy(text).split(' ').filter(Boolean);
  if (!words.length) return who.trim();
  const opening = words.length > QUOTE_WORDS ? `${words.slice(0, QUOTE_WORDS).join(' ')}…` : words.join(' ');
  return clip(who.trim() ? `${who.trim()}: ${opening}` : opening);
}
