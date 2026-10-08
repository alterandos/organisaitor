// A chart, described without reference to any charting library: what kind of chart, its labels
// and its series of numbers, and a few options. Stored as-is (a note's chart block keeps one of
// these), drawn by chartAdapter.ts. A library change rewrites the adapter, never stored notes.
// Pure: the data helpers here (reading pasted tables, 100% stacking, waterfall steps) are tested
// in chartSpec.test.ts. Meant for every app in the suite, not only Notes.

export const CHART_KINDS = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'waterfall'] as const;
export type ChartKind = typeof CHART_KINDS[number];

// How several series share the axis: side by side, stacked, or stacked to 100%.
export type ChartStacking = 'none' | 'stacked' | 'percent';

export interface ChartSeries {
  name:   string;
  values: (number | null)[];   // one per label; null = no value
}

export interface ChartSpec {
  title:    string;
  xTitle:   string;             // the labels' heading (the first column of the table)
  yTitle:   string;
  labels:   string[];
  series:   ChartSeries[];
  stacking: ChartStacking;
  waterfallTotal: boolean;      // waterfall: a final bar with the running total
}

// Which kinds can stack (pie, scatter and waterfall can't).
export const STACKABLE: ReadonlySet<ChartKind> = new Set(['column', 'bar', 'line', 'area']);
// Which kinds draw only the first series.
export const SINGLE_SERIES: ReadonlySet<ChartKind> = new Set(['pie', 'doughnut', 'waterfall']);

export function emptyChart(): ChartSpec {
  return {
    title: '',
    xTitle: '',
    yTitle: '',
    labels: ['A', 'B', 'C'],
    series: [{ name: 'Series 1', values: [null, null, null] }],
    stacking: 'none',
    waterfallTotal: true,
  };
}

// Reads whatever a stored or pasted spec holds into a whole, consistent one (every series as long
// as the labels), so the rest of the code never checks.
export function normalizeChart(raw: unknown): ChartSpec {
  const base = emptyChart();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ChartSpec>;
  const labels = Array.isArray(r.labels) ? r.labels.map((l) => String(l ?? '')) : base.labels;
  const series = (Array.isArray(r.series) && r.series.length ? r.series : base.series).map((s, i) => ({
    name: typeof s?.name === 'string' ? s.name : `Series ${i + 1}`,
    values: labels.map((_, j) => {
      const v = Array.isArray(s?.values) ? s.values[j] : null;
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }),
  }));
  return {
    title: typeof r.title === 'string' ? r.title : '',
    xTitle: typeof r.xTitle === 'string' ? r.xTitle : '',
    yTitle: typeof r.yTitle === 'string' ? r.yTitle : '',
    labels,
    series,
    stacking: r.stacking === 'stacked' || r.stacking === 'percent' ? r.stacking : 'none',
    waterfallTotal: r.waterfallTotal !== false,
  };
}

// ── Reading numbers and pasted tables ────────────────────────────────────────

// A cell as a number: "1,234.5", "$12", "45%", "(30)" (accounting negative), "−7", "1 200".
// Null when it isn't one.
export function parseNumber(raw: string): number | null {
  let t = raw.trim();
  if (!t) return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1); }
  t = t.replace(/[−–]/g, '-').replace(/[\s\u00a0]/g, '').replace(/^[$€£¥₹]+/, '').replace(/[$€£¥₹%]+$/, '');
  // Thousands separators: commas before groups of three (1,234,567 or 1,234.5).
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  // A lone comma as the decimal point (12,5).
  else if (/^[-+]?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

// Splits pasted text into rows of cells: tab-separated (a copy from a spreadsheet) when there are
// tabs, else comma- or semicolon-separated with "quoted, cells".
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!clean.trim()) return [];
  const firstLine = clean.split('\n')[0];
  const semis = firstLine.split(';').length - 1;
  const sep = clean.includes('\t') ? '\t' : (semis > 0 && semis >= firstLine.split(',').length - 1 ? ';' : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; }
    else if (ch === sep) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ''));
}

// A pasted table as chart data. The first column is the labels; each further column a series.
// The first row is headings when its cells (after the first) aren't numbers. A table that is
// wider than it is long and whose first column is all numbers isn't turned round: what's pasted is
// read as laid out.
export function tableToChart(rows: string[][], base: ChartSpec = emptyChart()): ChartSpec | null {
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  if (width < 1) return null;
  const grid = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  const header = grid[0].slice(1).some((c) => c !== '' && parseNumber(c) === null) || (width === 1 && parseNumber(grid[0][0]) === null);
  const body = header ? grid.slice(1) : grid;
  if (body.length === 0) return null;
  // One column of numbers alone: they're the values, numbered labels.
  if (width === 1) {
    return normalizeChart({
      ...base,
      labels: body.map((_, i) => String(i + 1)),
      series: [{ name: header ? grid[0][0] : base.series[0]?.name ?? 'Series 1', values: body.map((r) => parseNumber(r[0])) }],
    });
  }
  return normalizeChart({
    ...base,
    xTitle: header ? grid[0][0] : base.xTitle,
    labels: body.map((r) => r[0]),
    series: Array.from({ length: width - 1 }, (_, k) => ({
      name: header ? grid[0][k + 1] || `Series ${k + 1}` : `Series ${k + 1}`,
      values: body.map((r) => parseNumber(r[k + 1])),
    })),
  });
}

// The chart's data as a tab-separated table (copy as text, and the paste box's starting text).
export function chartToTable(spec: ChartSpec): string {
  const head = [spec.xTitle, ...spec.series.map((s) => s.name)].join('\t');
  const rows = spec.labels.map((l, i) => [l, ...spec.series.map((s) => (s.values[i] ?? '') === '' ? '' : String(s.values[i]))].join('\t'));
  return [head, ...rows].join('\n');
}

// ── What a chart kind draws ───────────────────────────────────────────────────

// 100% stacking: each label's values as shares of that label's total (0–100). A label whose
// values are all empty or zero stays empty.
export function toPercentages(series: ChartSeries[]): ChartSeries[] {
  const n = series[0]?.values.length ?? 0;
  const totals = Array.from({ length: n }, (_, i) => series.reduce((t, s) => t + Math.abs(s.values[i] ?? 0), 0));
  return series.map((s) => ({
    ...s,
    values: s.values.map((v, i) => (v === null || totals[i] === 0 ? null : Math.round((Math.abs(v) / totals[i]) * 10000) / 100)),
  }));
}

export interface WaterfallStep {
  label: string;
  from:  number;
  to:    number;
  kind:  'up' | 'down' | 'total';
}

// A waterfall: each value is a change from the running total, drawn as a floating bar from the
// total before to the total after; then (optionally) the total itself, from zero.
export function waterfallSteps(labels: string[], values: (number | null)[], withTotal: boolean, totalLabel: string): WaterfallStep[] {
  let running = 0;
  const steps: WaterfallStep[] = labels.map((label, i) => {
    const v = values[i] ?? 0;
    const step: WaterfallStep = { label, from: running, to: running + v, kind: v < 0 ? 'down' : 'up' };
    running += v;
    return step;
  });
  if (withTotal) steps.push({ label: totalLabel, from: 0, to: running, kind: 'total' });
  return steps;
}
