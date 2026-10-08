import { describe, expect, it } from 'vitest';
import { toChartConfig, type ChartTheme } from './chartAdapter';
import { normalizeChart } from './chartSpec';

const theme: ChartTheme = { text: '#111', muted: '#666', grid: '#ddd', surface: '#fff', primary: '#6366f1', up: '#10b981', down: '#ef4444', font: 'sans-serif' };
const words = { total: 'Total' };
const spec = normalizeChart({
  title: 'Sales', labels: ['Q1', 'Q2'],
  series: [{ name: 'North', values: [1, 3] }, { name: 'South', values: [3, 1] }],
});
// The parts of a config these tests read, without Chart.js's deep option types.
type Loose = { type: string; data: { labels?: unknown[]; datasets: { data: unknown[]; fill?: unknown; label?: string }[] }; options: { indexAxis?: string; scales?: Record<string, { stacked?: boolean; max?: number }>; plugins?: { legend?: { display?: boolean }; title?: { text?: string } } } };
const config = (s = spec, kind: Parameters<typeof toChartConfig>[1] = 'column') => toChartConfig(s, kind, theme, words) as unknown as Loose;

describe('the chart adapter (Chart.js)', () => {
  it('column and bar: one dataset per series, bar lies on its side; title and legend', () => {
    const c = config();
    expect(c.type).toBe('bar');
    expect(c.data.datasets.map((d) => d.data)).toEqual([[1, 3], [3, 1]]);
    expect(c.options.plugins?.title?.text).toBe('Sales');
    expect(c.options.plugins?.legend?.display).toBe(true);
    expect(config(spec, 'bar').options.indexAxis).toBe('y');
  });

  it('100% stacking draws shares, on a 0–100 axis, stacked', () => {
    const c = config({ ...spec, stacking: 'percent' });
    expect(c.data.datasets.map((d) => d.data)).toEqual([[25, 75], [75, 25]]);
    expect(c.options.scales?.y).toMatchObject({ stacked: true, max: 100 });
    const area = config({ ...spec, stacking: 'percent' }, 'area');
    expect(area.type).toBe('line');
    expect(area.data.datasets.map((d) => d.fill)).toEqual(['origin', '-1']);
  });

  it('a waterfall floats each change, and adds the total', () => {
    const c = config(normalizeChart({ labels: ['Start', 'Costs'], series: [{ name: 'Cash', values: [100, -30] }] }), 'waterfall');
    expect(c.data.labels).toEqual(['Start', 'Costs', 'Total']);
    expect(c.data.datasets[0].data).toEqual([[0, 100], [100, 70], [0, 70]]);
    expect(c.options.plugins?.legend?.display).toBe(false);
  });

  it('pie draws the first series as slices; scatter reads the labels as x', () => {
    expect(config(spec, 'pie').data.datasets).toHaveLength(1);
    const sc = config(normalizeChart({ labels: ['1', '2.5'], series: [{ name: 'y', values: [4, null] }] }), 'scatter');
    expect(sc.data.datasets[0].data).toEqual([{ x: 1, y: 4 }]);
  });

  it('stacking is ignored where it means nothing (pie, scatter, waterfall)', () => {
    expect(config({ ...spec, stacking: 'percent' }, 'pie').data.datasets[0].data).toEqual([1, 3]);
  });
});
