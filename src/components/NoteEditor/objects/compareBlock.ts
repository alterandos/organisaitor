import { LABELS } from '@/config/labels';
import { insertCompare } from '../extensions/Compare';
import type { NoteBlockKind } from './types';

// `\compare`: a comparison (extensions/Compare.ts) in place of what was typed, the cursor in its
// first side's title.
export const compareBlock: NoteBlockKind = {
  family:  'block',
  category: 'weighing',
  id:      'compare',
  label:   LABELS.noteBlocks.compare.label,
  icon:    '⇄',
  aliases: ['comparison', 'vs', 'versus'],
  hint:    LABELS.noteBlocks.compare.hint,
  insert:  (view, from, to) => {
    const tr = insertCompare(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
