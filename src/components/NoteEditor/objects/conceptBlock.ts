import { LABELS } from '@/config/labels';
import { insertGlossaryCard } from '../extensions/GlossaryCard';
import type { NoteBlockKind } from './types';

// `\concept`: a new Concept in the Glossary, shown as a card (extensions/GlossaryCard.ts) in place of
// what was typed, the cursor in its term.
export const conceptBlock: NoteBlockKind = {
  family:  'block',
  id:      'concept',
  label:   LABELS.noteBlocks.concept.label,
  icon:    '💡',
  aliases: ['idea', 'notion', 'theory'],
  hint:    LABELS.noteBlocks.concept.hint,
  insert:  (view, from, to, ctx) => insertGlossaryCard(view, from, to, 'concept', ctx),
};
