import { LABELS } from '@/config/labels';
import { insertIdKey } from '../extensions/IdKey';
import type { NoteBlockKind } from './types';

// `\key`: an identification key (extensions/IdKey.ts) in place of what was typed.
export const idKeyBlock: NoteBlockKind = {
  family:  'block',
  category: 'structure',
  id:      'key',
  label:   LABELS.noteBlocks.idKey.label,
  icon:    '🔑',
  aliases: ['idkey', 'identify', 'identification', 'dichotomous'],
  hint:    LABELS.noteBlocks.idKey.hint,
  insert:  (view, from, to) => {
    const tr = insertIdKey(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
