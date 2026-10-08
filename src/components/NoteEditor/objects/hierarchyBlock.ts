import { LABELS } from '@/config/labels';
import { insertHierarchy } from '../extensions/Hierarchy';
import type { NoteBlockKind } from './types';

// `\hierarchy`: a hierarchy (extensions/Hierarchy.ts) in place of what was typed.
export const hierarchyBlock: NoteBlockKind = {
  family:  'block',
  id:      'hierarchy',
  label:   LABELS.noteBlocks.hierarchy.label,
  icon:    '🌳',
  aliases: ['tree', 'taxonomy', 'ranks', 'orgchart'],
  hint:    LABELS.noteBlocks.hierarchy.hint,
  insert:  (view, from, to) => {
    const tr = insertHierarchy(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
