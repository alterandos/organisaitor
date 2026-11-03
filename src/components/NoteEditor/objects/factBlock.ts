import { LABELS } from '@/config/labels';
import { insertGlossaryCard } from '../extensions/GlossaryCard';
import type { NoteBlockKind } from './types';

// `\fact`: a new Fact in the Glossary (2026-11-03), shown as a card (extensions/GlossaryCard.ts) in
// place of what was typed. Its headline fills itself in from the fact once that's written
// (utils/factHeadline.ts), unless one was typed.
export const factBlock: NoteBlockKind = {
  family:  'block',
  category: 'card',
  id:      'fact',
  label:   LABELS.noteBlocks.fact.label,
  icon:    '✨',
  aliases: ['didyouknow', 'trivia', 'funfact'],
  hint:    LABELS.noteBlocks.fact.hint,
  insert:  (view, from, to, ctx) => insertGlossaryCard(view, from, to, 'fact', ctx),
};
