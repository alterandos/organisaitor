import { LABELS } from '@/config/labels';
import { insertPyramid } from '../extensions/Pyramid';
import type { NoteBlockKind } from './types';

// `\pyramid`: a pyramid (extensions/Pyramid.ts) in place of what was typed.
export const pyramidBlock: NoteBlockKind = {
  family:  'block',
  id:      'pyramid',
  label:   LABELS.noteBlocks.pyramid.label,
  icon:    '🔺',
  aliases: ['layers', 'funnel', 'maslow'],
  hint:    LABELS.noteBlocks.pyramid.hint,
  insert:  (view, from, to) => {
    const tr = insertPyramid(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
