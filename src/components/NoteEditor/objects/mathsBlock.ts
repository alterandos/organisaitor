import { LABELS } from '@/config/labels';
import { editMathAt, insertMaths } from '../extensions/Maths';
import type { NoteBlockKind } from './types';

// `\maths`: maths (extensions/Maths.ts) in place of what was typed: a block on an empty line,
// inline inside text. Its editor opens straight away.
export const mathsBlock: NoteBlockKind = {
  family:  'block',
  category: 'visual',
  id:      'maths',
  label:   LABELS.noteBlocks.maths.label,
  icon:    '∑',
  aliases: ['math', 'equation', 'eq', 'formula', 'latex'],
  hint:    LABELS.noteBlocks.maths.hint,
  insert:  (view, from, to) => {
    const made = insertMaths(view.state, from, to);
    if (!made) return;
    view.dispatch(made.tr);
    editMathAt(view, made.pos);
  },
};
