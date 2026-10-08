import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { STACKABLE, normalizeChart, type ChartKind, type ChartStacking } from '@/charts/chartSpec';
import type { NoteEditorMenuApi } from '../contextMenu';
import { CHART_DESIGNS, chartPosAt, openChartData, setChartSettings, setChartStacking } from './Chart';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click on a chart: its type, stacking, frame, and its data (the table, or paste a table).
registerContextMenuProvider({
  id: 'note-editor.chart',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="chart"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = chartPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.chart;
    const C = LABELS.charts;
    const spec = normalizeChart(node.attrs.spec);
    const items = [
      designMenuItem(CHART_DESIGNS, node.attrs.variant as ChartKind, (v) => setChartSettings(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
      { id: 'chart-data', label: L.editData, icon: '▦', run: () => openChartData(view, pos) },
      { id: 'chart-paste', label: C.paste, icon: '⎘', run: () => openChartData(view, pos, true) },
    ];
    if (STACKABLE.has(node.attrs.variant as ChartKind) && spec.series.length > 1) {
      items.splice(1, 0, {
        id: 'chart-stacking', label: C.stackingTitle(C.stacking[spec.stacking]).split('.')[0], icon: '☰',
        submenu: [(['none', 'stacked', 'percent'] as ChartStacking[]).map((s) => ({
          id: `stacking-${s}`, label: C.stacking[s], icon: spec.stacking === s ? '✓' : undefined, run: () => setChartStacking(view, pos, s),
        }))],
      } as never);
    }
    return items;
  },
});
