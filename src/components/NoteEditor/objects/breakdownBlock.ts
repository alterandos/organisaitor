import { LABELS } from '@/config/labels';
import { insertBreakdown } from '../extensions/Breakdown';
import type { NoteBlockKind } from './types';

// `\breakdown`: a breakdown (extensions/Breakdown.ts) in place of what was typed.
export const breakdownBlock: NoteBlockKind = {
  family:  'block',
  id:      'breakdown',
  label:   LABELS.noteBlocks.breakdown.label,
  icon:    '🧩',
  aliases: ['parts', 'pillars', 'components', 'madeof'],
  hint:    LABELS.noteBlocks.breakdown.hint,
  insert:  (view, from, to) => {
    const tr = insertBreakdown(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
