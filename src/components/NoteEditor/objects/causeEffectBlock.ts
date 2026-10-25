import { LABELS } from '@/config/labels';
import { insertCauseEffect } from '../extensions/CauseEffect';
import type { NoteBlockKind } from './types';

// `\cause`: cause and effect (extensions/CauseEffect.ts) in place of what was typed.
export const causeEffectBlock: NoteBlockKind = {
  family:  'block',
  category: 'structure',
  id:      'cause',
  label:   LABELS.noteBlocks.causeEffect.label,
  icon:    '🧲',
  aliases: ['effect', 'causes', 'effects', 'causeeffect', 'why'],
  hint:    LABELS.noteBlocks.causeEffect.hint,
  insert:  (view, from, to) => {
    const tr = insertCauseEffect(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
