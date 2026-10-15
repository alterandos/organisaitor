import { LABELS } from '@/config/labels';
import { insertProsCons } from '../extensions/ProsCons';
import type { NoteBlockKind } from './types';

// `\proscons`: weighing one thing (extensions/ProsCons.ts) in place of what was typed.
export const prosConsBlock: NoteBlockKind = {
  family:  'block',
  category: 'weighing',
  id:      'proscons',
  label:   LABELS.noteBlocks.prosCons.label,
  icon:    '⚖️',
  aliases: ['pros', 'cons', 'weigh', 'forandagainst'],
  hint:    LABELS.noteBlocks.prosCons.hint,
  insert:  (view, from, to) => {
    const tr = insertProsCons(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
