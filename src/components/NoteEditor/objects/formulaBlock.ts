import { LABELS } from '@/config/labels';
import { insertGlossaryCard } from '../extensions/GlossaryCard';
import type { NoteBlockKind } from './types';

// `\formula`: a new Formula in the Glossary (2026-11-03), shown as a card (extensions/GlossaryCard.ts)
// in place of what was typed: a named formula or measure (the coefficient of determination), its
// formula drawn with MathLive. A formula with no name to it is still `\maths`.
export const formulaBlock: NoteBlockKind = {
  family:  'block',
  category: 'card',
  id:      'formula',
  label:   LABELS.noteBlocks.formula.label,
  icon:    'ƒ',
  aliases: ['measure', 'metric', 'statistic'],
  hint:    LABELS.noteBlocks.formula.hint,
  insert:  (view, from, to, ctx) => insertGlossaryCard(view, from, to, 'formula', ctx),
};
