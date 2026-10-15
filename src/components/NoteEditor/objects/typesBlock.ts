import { LABELS } from '@/config/labels';
import { insertTypes } from '../extensions/Types';
import type { NoteBlockKind } from './types';

// `\types`: a category and its kinds (extensions/Types.ts) in place of what was typed.
export const typesBlock: NoteBlockKind = {
  family:  'block',
  category: 'structure',
  id:      'types',
  label:   LABELS.noteBlocks.types.label,
  icon:    '🗂️',
  aliases: ['kinds', 'varieties', 'typesof'],
  hint:    LABELS.noteBlocks.types.hint,
  insert:  (view, from, to) => {
    const tr = insertTypes(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
