import { LABELS } from '@/config/labels';
import { insertCycle } from '../extensions/Cycle';
import type { NoteBlockKind } from './types';

// `\cycle`: a cycle (extensions/Cycle.ts) in place of what was typed.
export const cycleBlock: NoteBlockKind = {
  family:  'block',
  id:      'cycle',
  label:   LABELS.noteBlocks.cycle.label,
  icon:    '🔄',
  aliases: ['loop', 'cyc'],
  hint:    LABELS.noteBlocks.cycle.hint,
  insert:  (view, from, to) => {
    const tr = insertCycle(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
