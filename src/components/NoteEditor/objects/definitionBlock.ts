import { LABELS } from '@/config/labels';
import { insertGlossaryCard } from '../extensions/GlossaryCard';
import type { NoteBlockKind } from './types';

// `\definition`: a new Definition in the Glossary, shown as a card (extensions/GlossaryCard.ts) in place of
// what was typed, the cursor in its term.
export const definitionBlock: NoteBlockKind = {
  family:  'block',
  id:      'definition',
  label:   LABELS.noteBlocks.definition.label,
  icon:    '📖',
  aliases: ['define', 'def', 'term', 'meaning'],
  hint:    LABELS.noteBlocks.definition.hint,
  insert:  (view, from, to, ctx) => insertGlossaryCard(view, from, to, 'definition', ctx),
};
