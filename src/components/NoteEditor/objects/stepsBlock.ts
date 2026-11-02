import { LABELS } from '@/config/labels';
import { insertSteps } from '../extensions/Steps';
import type { NoteBlockKind } from './types';

// `\steps`: the steps of something, in order (extensions/Steps.ts), in place of what was typed.
export const stepsBlock: NoteBlockKind = {
  family:  'block',
  category: 'structure',
  id:      'steps',
  label:   LABELS.noteBlocks.steps.label,
  icon:    '🪜',
  aliases: ['stages', 'procedure', 'method', 'howto'],
  hint:    LABELS.noteBlocks.steps.hint,
  insert:  (view, from, to) => {
    const tr = insertSteps(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
