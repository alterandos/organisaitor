import { LABELS } from '@/config/labels';
import { insertDiagram } from '../extensions/Diagram';
import type { NoteBlockKind } from './types';

// `\diagram`: a diagram (extensions/Diagram.ts) in place of what was typed.
export const diagramBlock: NoteBlockKind = {
  family:  'block',
  category: 'visual',
  id:      'diagram',
  label:   LABELS.noteBlocks.diagram.label,
  icon:    '🔀',
  aliases: ['flow', 'flowchart', 'process', 'workflow', 'mindmap', 'map', 'graph'],
  hint:    LABELS.noteBlocks.diagram.hint,
  insert:  (view, from, to) => {
    const tr = insertDiagram(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
