import { LABELS } from '@/config/labels';
import { insertArgument } from '../extensions/Argument';
import type { NoteBlockKind } from './types';

// `\argument`: a claim and the case for and against it (extensions/Argument.ts) in place of what
// was typed, the cursor in the claim.
export const argumentBlock: NoteBlockKind = {
  family:  'block',
  category: 'weighing',
  id:      'argument',
  label:   LABELS.noteBlocks.argument.label,
  icon:    '🗣️',
  aliases: ['arg', 'claim', 'assertion', 'case', 'debate', 'thesis'],
  hint:    LABELS.noteBlocks.argument.hint,
  insert:  (view, from, to) => {
    const tr = insertArgument(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
