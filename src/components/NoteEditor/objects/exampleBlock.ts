import { LABELS } from '@/config/labels';
import { insertGlossaryCard } from '../extensions/GlossaryCard';
import type { NoteBlockKind } from './types';

// `\example`: a new Example in the Glossary (2026-11-12; its kind's key is `instance`), shown as a
// card in place of what was typed: what it's an example of are its links.
export const exampleBlock: NoteBlockKind = {
  family:  'block',
  category: 'card',
  id:      'example',
  label:   LABELS.noteBlocks.example.label,
  icon:    '👉',
  aliases: ['eg', 'instance'],
  hint:    LABELS.noteBlocks.example.hint,
  insert:  (view, from, to, ctx) => insertGlossaryCard(view, from, to, 'instance', ctx),
};
