import { LABELS } from '@/config/labels';
import { insertChart } from '../extensions/Chart';
import type { NoteBlockKind } from './types';

// `\chart`: a chart (extensions/Chart.ts) in place of what was typed, its table open.
export const chartBlock: NoteBlockKind = {
  family:  'block',
  id:      'chart',
  label:   LABELS.noteBlocks.chart.label,
  icon:    '📊',
  aliases: ['graph', 'plot', 'waterfall'],
  hint:    LABELS.noteBlocks.chart.hint,
  insert:  (view, from, to) => {
    const tr = insertChart(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};
