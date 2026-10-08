import type { ChartConfiguration, ChartDataset } from 'chart.js';
import { type ChartKind, type ChartSpec, SINGLE_SERIES, STACKABLE, parseNumber, toPercentages, waterfallSteps } from './chartSpec';

// The one place that knows the charting library (Chart.js today, chosen 2026-10-07 as the simplest
// option, kept swappable). A ChartSpec goes in, a drawn chart comes out. The library is loaded on
// first use (drawChart), so the rest of the app never pays for it. toChartConfig is pure and
// tested; drawChart and the handle are the only parts that touch a canvas.

export interface ChartTheme {
  text:    string;
  muted:   string;
  grid:    string;
  surface: string;
  primary: string;
  up:      string;
  down:    string;
  font:    string;
}

// The chart's colours from the page's own tokens, so it follows light and dark mode.
export function readChartTheme(): ChartTheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    text: v('--color-text', '#1f2937'),
    muted: v('--color-muted', '#6b7280'),
    grid: v('--color-border', '#e5e7eb'),
    surface: v('--color-surface', '#ffffff'),
    primary: v('--color-primary', '#6366f1'),
    up: v('--color-success', '#10b981'),
    down: v('--color-danger', '#ef4444'),
    font: getComputedStyle(document.body).fontFamily,
  };
}

// Series colours: the accent first, then round the colour wheel. seriesCssColor is the same colour
// for CSS (the data table's series headings).
export function seriesColor(theme: ChartTheme, i: number): string {
  return i === 0 ? theme.primary : seriesCssColor(i);
}
export const seriesCssColor = (i: number): string =>
  i === 0 ? 'var(--color-primary)' : `hsl(${Math.round((235 + i * 67) % 360)} 62% 55%)`;

const withAlpha = (color: string, alpha: number) => `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;

export interface ChartLabels { total: string }

export function toChartConfig(spec: ChartSpec, kind: ChartKind, theme: ChartTheme, words: ChartLabels): ChartConfiguration {
  const stacking = STACKABLE.has(kind) ? spec.stacking : 'none';
  const percent = stacking === 'percent';
  const stacked = stacking !== 'none';
  const series = SINGLE_SERIES.has(kind) ? spec.series.slice(0, 1) : spec.series;
  const shown = percent ? toPercentages(series) : series;
  const horizontal = kind === 'bar';
  const valueAxis = horizontal ? 'x' : 'y';
  const categoryAxis = horizontal ? 'y' : 'x';
  const font = { family: theme.font };
  const axis = (title: string, isValue: boolean) => ({
    stacked: isValue ? stacked : stacked && kind !== 'line' && kind !== 'area' ? true : stacked,
    grid: { color: withAlpha(theme.grid, isValue ? 0.9 : 0.4), drawTicks: false },
    border: { color: theme.grid },
    ticks: {
      color: theme.muted, font, padding: 6,
      ...(isValue && percent ? { callback: (v: number | string) => `${v}%` } : {}),
    },
    ...(isValue && percent ? { min: 0, max: 100 } : {}),
    title: { display: !!title, text: title, color: theme.muted, font: { ...font, weight: 600 as const } },
  });
  const plugins = {
    title: { display: !!spec.title, text: spec.title, color: theme.text, font: { ...font, size: 15, weight: 700 as const }, padding: { bottom: 12 } },
    legend: {
      display: kind === 'pie' || kind === 'doughnut' || (!SINGLE_SERIES.has(kind) && series.length > 1),
      position: 'bottom' as const,
      labels: { color: theme.text, font, usePointStyle: true, pointStyle: 'circle' as const, boxWidth: 7, boxHeight: 7, padding: 14 },
    },
    tooltip: {
      callbacks: percent ? { label: (c: { dataset: { label?: string }; formattedValue: string }) => `${c.dataset.label}: ${c.formattedValue}%` } : {},
    },
  };

  if (kind === 'pie' || kind === 'doughnut') {
    const values = (shown[0]?.values ?? []).map((v) => v ?? 0);
    return {
      type: kind,
      data: {
        labels: spec.labels,
        datasets: [{
          label: shown[0]?.name ?? '',
          data: values,
          backgroundColor: spec.labels.map((_, i) => seriesColor(theme, i)),
          borderColor: theme.surface,
          borderWidth: 2,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, plugins, ...(kind === 'doughnut' ? { cutout: '58%' } : {}) },
    };
  }

  if (kind === 'waterfall') {
    const steps = waterfallSteps(spec.labels, shown[0]?.values ?? [], spec.waterfallTotal, words.total);
    const colors = steps.map((s) => (s.kind === 'total' ? theme.primary : s.kind === 'up' ? theme.up : theme.down));
    return {
      type: 'bar',
      data: {
        labels: steps.map((s) => s.label),
        datasets: [{
          label: shown[0]?.name ?? '',
          data: steps.map((s) => [s.from, s.to]) as unknown as number[],
          backgroundColor: colors.map((c) => withAlpha(c, 0.85)),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 3,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        scales: { x: axis(spec.xTitle, false), y: { ...axis(spec.yTitle, true), stacked: false } },
        plugins: {
          ...plugins,
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c: { dataIndex: number }) => {
                const s = steps[c.dataIndex];
                const change = s.to - s.from;
                return s.kind === 'total' ? `${s.to}` : `${change >= 0 ? '+' : ''}${change} → ${s.to}`;
              },
            },
          },
        },
      },
    };
  }

  if (kind === 'scatter') {
    const xs = spec.labels.map((l, i) => parseNumber(l) ?? i + 1);
    return {
      type: 'scatter',
      data: {
        datasets: shown.map((s, i) => ({
          label: s.name,
          data: s.values.map((v, j) => (v === null ? null : { x: xs[j], y: v })).filter((p): p is { x: number; y: number } => !!p),
          backgroundColor: withAlpha(seriesColor(theme, i), 0.75),
          borderColor: seriesColor(theme, i),
          pointRadius: 4,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        scales: { x: { ...axis(spec.xTitle, false), type: 'linear' as const }, y: axis(spec.yTitle, true) },
        plugins,
      },
    };
  }

  const isLine = kind === 'line' || kind === 'area';
  const datasets = shown.map((s, i): ChartDataset<'bar' | 'line'> => {
    const color = seriesColor(theme, i);
    return isLine
      ? {
          type: 'line',
          label: s.name,
          data: s.values,
          borderColor: color,
          backgroundColor: withAlpha(color, kind === 'area' ? (stacked ? 0.55 : 0.22) : 0.15),
          fill: kind === 'area' ? (stacked && i > 0 ? '-1' : 'origin') : false,
          tension: 0.3,
          pointRadius: 3,
          spanGaps: true,
        }
      : {
          type: 'bar',
          label: s.name,
          data: s.values,
          backgroundColor: withAlpha(color, 0.85),
          borderColor: color,
          borderWidth: 1,
          borderRadius: stacked ? 0 : 4,
        };
  });
  return {
    type: isLine ? 'line' : 'bar',
    data: { labels: spec.labels, datasets: datasets as unknown as ChartConfiguration['data']['datasets'] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      indexAxis: horizontal ? 'y' : 'x',
      scales: { [categoryAxis]: axis(spec.xTitle, false), [valueAxis]: axis(spec.yTitle, true) },
      plugins,
    },
  };
}

export interface ChartHandle {
  update(spec: ChartSpec, kind: ChartKind, theme: ChartTheme): void;
  destroy(): void;
}

type ChartCtor = typeof import('chart.js/auto').default;
let loading: Promise<ChartCtor> | null = null;
const loadChartJs = () => (loading ??= import('chart.js/auto').then((m) => m.default));

// Draws a spec on a canvas, loading the library the first time. The handle redraws in place
// (a kind change rebuilds, since the library can't change a chart's type in place).
export async function drawChart(canvas: HTMLCanvasElement, spec: ChartSpec, kind: ChartKind, theme: ChartTheme, words: ChartLabels): Promise<ChartHandle> {
  const Chart = await loadChartJs();
  let chart = new Chart(canvas, toChartConfig(spec, kind, theme, words));
  let current = kind;
  let currentStacking = spec.stacking;
  return {
    update(nextSpec, nextKind, nextTheme) {
      const config = toChartConfig(nextSpec, nextKind, nextTheme, words);
      // A different kind, or stacking switched, rebuilds (fills and axes are set at creation).
      if (nextKind !== current || nextSpec.stacking !== currentStacking) {
        chart.destroy();
        chart = new Chart(canvas, config);
        current = nextKind;
        currentStacking = nextSpec.stacking;
        return;
      }
      chart.data = config.data;
      chart.options = config.options ?? {};
      chart.update();
    },
    destroy() { chart.destroy(); },
  };
}
