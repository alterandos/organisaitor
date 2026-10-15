import { LABELS } from '@/config/labels';

// THE categories of note block (agreed with the user 2026-10-16). Every block kind names one
// (NoteBlockKind.category; a pattern test checks), and the category decides how the block is
// placed and how it's offered:
// - `inline`: it can sit inside a line of text, as a chip (a compact way of showing the same
//   content, never a copy). Typed after text, or on a bullet, it goes in as the chip; typed on an
//   empty line, as the block. A block without it goes after the line, or takes an empty line's
//   place (an empty bullet's too).
// - The `\` menu lists blocks under their category while nothing has been typed after the `\`.
// A new block picks one; a new category is one entry here plus its label.

export const BLOCK_CATEGORIES = [
  { id: 'card',      inline: true  },   // a record or a question shown as a card: Glossary cards, question
  { id: 'structure', inline: false },   // how parts of an idea fit together: timeline, cycle, breakdown…
  { id: 'weighing',  inline: false },   // weighing things up: compare, pros and cons, options
  { id: 'visual',    inline: false },   // drawn or typeset: chart, diagram, maths, code, quote
  { id: 'container', inline: false },   // holds or points at other things: inbox, hub, embed, a note link
] as const;

export type BlockCategory = typeof BLOCK_CATEGORIES[number]['id'];

export const categoryLabel = (id: BlockCategory): string => LABELS.noteBlocks.categories[id];
export const categoryInline = (id: BlockCategory): boolean => BLOCK_CATEGORIES.find((c) => c.id === id)?.inline ?? false;
export const categoryOrder = (id: BlockCategory): number => BLOCK_CATEGORIES.findIndex((c) => c.id === id);
