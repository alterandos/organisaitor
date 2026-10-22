import { LABELS } from '@/config/labels';
import { focusConvert, insertConvert } from '../extensions/Convert';
import type { NoteBlockKind } from './types';

// `\convert`: a conversion (extensions/Convert.ts) in place of what was typed, its amount ready to type.
export const convertBlock: NoteBlockKind = {
  family:  'block',
  category: 'visual',
  id:      'convert',
  label:   LABELS.noteBlocks.convert.label,
  icon:    '🔁',
  aliases: ['converter', 'conversion', 'units', 'unit'],
  hint:    LABELS.noteBlocks.convert.hint,
  insert:  (view, from, to) => {
    const tr = insertConvert(view.state, from, to);
    if (!tr) return;
    view.dispatch(tr);
    focusConvert(view, view.state.selection.from);
  },
};
