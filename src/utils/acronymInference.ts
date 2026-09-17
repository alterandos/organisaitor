// Non-AI acronym-field inference — regex/heuristic only, consistent with the rest of this
// app's inference (see textToTask.ts). Scoped as the deliberate first step; an LLM-backed
// version is a documented stretch goal (see BACKLOG.md "Structured tag entries") once this
// proves insufficient, not something built here.
//
// Two inputs: `selectedText` (what the user actually highlighted before applying the
// Acronym tag) and `contextText` (the surrounding paragraph's full text, selectedText
// included) — patterns are matched against contextText so an expansion written just
// before/after the highlighted acronym is still found even though it wasn't selected.

export interface AcronymInferenceResult {
  term: string;               // the acronym token itself, e.g. "ASX"
  expansion: string | null;   // what it stands for, if confidently found
}

const STOPWORDS = new Set(['of', 'the', 'and', 'for', 'in', 'on', 'a', 'an', 'to', 'at', 'or']);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Does `phrase`'s words spell out `term` via their initials, in order (skipping common
// stopwords, which real-world expansions like "Australian Stock Exchange" never abbreviate
// as part of the acronym)? Case-insensitive on both sides.
function initialsMatch(term: string, phrase: string): boolean {
  const letters = term.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length < 2) return false;
  const words = phrase.trim().split(/\s+/).filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  if (words.length === 0) return false;
  const initials = words.map((w) => w[0]?.toLowerCase() ?? '').join('');
  return initials === letters;
}

function cleanExpansion(text: string): string {
  return text.trim().replace(/[.,;]+$/, '').trim();
}

// Tries, in order of confidence, to find `term`'s expansion inside `contextText`:
//   1. "Expansion (TERM)"  — capture the phrase immediately before the parenthesis
//   2. "TERM (Expansion)"  — capture inside the parenthesis
//   3. "TERM: Expansion" / "TERM - Expansion" / "TERM – Expansion"
//   4. "Expansion: TERM" / "Expansion - TERM" (reversed, less common — lower priority)
// Each candidate is preferred over a lower one only when found; the initials check (when it
// applies) doesn't gate these patterns, it's an independent secondary signal used by
// inferAcronymFromSelection below for the "highlighted the whole phrase" case.
function findExpansionInContext(term: string, contextText: string): string | null {
  const t = escapeRegExp(term);

  const beforeParen = contextText.match(new RegExp(`([A-Za-z][A-Za-z\\s-]{1,80}?)\\s*\\(\\s*${t}\\s*\\)`, 'i'));
  if (beforeParen) return cleanExpansion(beforeParen[1]);

  const insideParen = contextText.match(new RegExp(`\\b${t}\\s*\\(([^()]{1,120})\\)`, 'i'));
  if (insideParen) return cleanExpansion(insideParen[1]);

  const colonOrDash = contextText.match(new RegExp(`\\b${t}\\s*[:\\-–]\\s*([^.\\n;]{1,120})`, 'i'));
  if (colonOrDash) return cleanExpansion(colonOrDash[1]);

  const reversed = contextText.match(new RegExp(`([A-Za-z][A-Za-z\\s-]{1,80}?)\\s*[:\\-–]\\s*${t}\\b`, 'i'));
  if (reversed) return cleanExpansion(reversed[1]);

  return null;
}

// Main entry point. `selectedText` is what the user highlighted; `contextText` is the
// surrounding paragraph (selectedText's own occurrence still present in it).
export function inferAcronymFromSelection(selectedText: string, contextText: string): AcronymInferenceResult {
  const trimmed = selectedText.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  // Single token selected (the common, expected case): that token IS the acronym — search
  // the surrounding context for its expansion.
  if (words.length <= 1) {
    const term = trimmed;
    return { term, expansion: term ? findExpansionInContext(term, contextText) : null };
  }

  // A whole phrase was selected. High-confidence case: an all-caps token (2-10 letters) at
  // the very start or end of the phrase whose letters are exactly the initials of the
  // remaining words — we can be certain that token is the acronym and the rest is the
  // expansion, per the user's own stated rule.
  const first = words[0];
  const last  = words[words.length - 1];
  const isAcronymLike = (w: string) => /^[A-Z]{2,10}$/.test(w);

  if (isAcronymLike(first)) {
    const rest = words.slice(1).join(' ');
    if (initialsMatch(first, rest)) return { term: first, expansion: cleanExpansion(rest) };
  }
  if (isAcronymLike(last)) {
    const rest = words.slice(0, -1).join(' ');
    if (initialsMatch(last, rest)) return { term: last, expansion: cleanExpansion(rest) };
  }

  // No confident initials match — fall back to whichever end looks acronym-shaped (without
  // the initials guarantee), else just search the context for either candidate's expansion,
  // else give up and let the user fill it in manually.
  if (isAcronymLike(first)) return { term: first, expansion: findExpansionInContext(first, contextText) ?? cleanExpansion(words.slice(1).join(' ')) };
  if (isAcronymLike(last))  return { term: last,  expansion: findExpansionInContext(last, contextText)  ?? cleanExpansion(words.slice(0, -1).join(' ')) };

  return { term: trimmed, expansion: findExpansionInContext(trimmed, contextText) };
}
