// Non-AI guess at a term and its meaning from highlighted text, for the Definition and Concept
// structured tags (config/structuredTagTypes.ts). Two cases:
// - the selection is the whole definition: "Photosynthesis is the process by which…",
//   "Osmosis: the movement of…", "GDP (gross domestic product) – the total value of…";
// - the selection is just the term: its meaning is looked for in the sentence around it
//   ("…, where photosynthesis is the process by which plants…").
// Returns an empty meaning rather than a guess when no pattern fits.

const LINKING = /\s+(?:is|are|was|were|means|meant|refers to|refer to|is defined as|are defined as|is called|describes|denotes)\s+(?:(?:a|an|the)\s+)?/i;
const PUNCT = /\s*(?::|–|—|\s-\s|=)\s*/;
const MAX_TERM_WORDS = 6;

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const stripEnd = (s: string) => tidy(s).replace(/[.;,]+$/, '');
const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const words = (s: string) => tidy(s).split(' ').filter(Boolean).length;

function split(text: string): { term: string; meaning: string } | null {
  for (const sep of [PUNCT, LINKING]) {
    const m = text.match(sep);
    if (!m || m.index === undefined || m.index === 0) continue;
    const term = stripEnd(text.slice(0, m.index)).replace(/^(?:a|an|the)\s+/i, '');
    const meaning = stripEnd(text.slice(m.index + m[0].length));
    if (term && meaning && words(term) <= MAX_TERM_WORDS) return { term, meaning: capitalise(meaning) };
  }
  return null;
}

export function inferDefinitionFromSelection(selectedText: string, contextText: string): { term: string; meaning: string } {
  const selected = tidy(selectedText);
  if (words(selected) > MAX_TERM_WORDS) return split(selected) ?? { term: '', meaning: capitalise(stripEnd(selected)) };
  // The selection is the term: find the sentence it starts a definition in.
  const term = stripEnd(selected).replace(/^(?:a|an|the)\s+/i, '');
  const sentences = tidy(contextText).split(/(?<=[.!?])\s+/);
  const lower = term.toLowerCase();
  for (const sentence of sentences) {
    const at = sentence.toLowerCase().indexOf(lower);
    if (at < 0) continue;
    const found = split(sentence.slice(at));
    if (found && found.term.toLowerCase() === lower) return { term, meaning: found.meaning };
  }
  return { term, meaning: '' };
}
