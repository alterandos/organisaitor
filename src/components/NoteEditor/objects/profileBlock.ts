import { LABELS } from '@/config/labels';
import { insertGlossaryCard } from '../extensions/GlossaryCard';
import type { NoteBlockKind } from './types';

// `\profile`: a new Profile in the Glossary (a card about a thing: a picture and its facts), shown
// as a card (extensions/GlossaryCard.ts) in place of what was typed, the cursor in its name.
export const profileBlock: NoteBlockKind = {
  family:  'block',
  category: 'card',
  id:      'profile',
  label:   LABELS.noteBlocks.profile.label,
  icon:    '🪪',
  aliases: ['infobox', 'about', 'card', 'factfile'],
  hint:    LABELS.noteBlocks.profile.hint,
  insert:  (view, from, to, ctx) => insertGlossaryCard(view, from, to, 'profile', ctx),
};
