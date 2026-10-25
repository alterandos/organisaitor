import { LABELS } from '@/config/labels';
import { insertVenn } from '../extensions/Venn';
import type { NoteBlockKind } from './types';

// `\venn`: a Venn diagram (extensions/Venn.ts) in place of what was typed.
export const vennBlock: NoteBlockKind = {
  family:  'block',
  category: 'weighing',
  id:      'venn',
  label:   LABELS.noteBlocks.venn.label,
  icon:    '⭕',
  aliases: ['sets', 'overlap', 'intersection'],
  hint:    LABELS.noteBlocks.venn.hint,
  insert:  (view, from, to) => {
    const tr = insertVenn(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
