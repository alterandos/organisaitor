import { LABELS } from '@/config/labels';
import { insertConclusion } from '../extensions/Conclusion';
import type { NoteBlockKind } from './types';

// `\conclusion`: a conclusion (extensions/Conclusion.ts) in place of what was typed.
export const conclusionBlock: NoteBlockKind = {
  family:  'block',
  category: 'structure',
  id:      'conclusion',
  label:   LABELS.noteBlocks.conclusion.label,
  icon:    '∴',
  aliases: ['therefore', 'thus', 'conc'],
  hint:    LABELS.noteBlocks.conclusion.hint,
  insert:  (view, from, to) => {
    const tr = insertConclusion(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
