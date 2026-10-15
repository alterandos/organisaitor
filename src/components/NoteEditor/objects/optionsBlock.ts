import { LABELS } from '@/config/labels';
import { insertOptions } from '../extensions/Options';
import type { NoteBlockKind } from './types';

// `\options`: the different ways to one end (extensions/Options.ts) in place of what was typed.
export const optionsBlock: NoteBlockKind = {
  family:  'block',
  category: 'weighing',
  id:      'options',
  label:   LABELS.noteBlocks.options.label,
  icon:    '🔀',
  aliases: ['alternatives', 'choices', 'approaches'],
  hint:    LABELS.noteBlocks.options.hint,
  insert:  (view, from, to) => {
    const tr = insertOptions(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
