import { LABELS } from '@/config/labels';
import {
  SINGLE_SERIES, type ChartKind, type ChartSpec,
  chartToTable, normalizeChart, parseDelimited, parseNumber, tableToChart,
} from './chartSpec';
import { drawChart, readChartTheme, seriesCssColor, type ChartHandle } from './chartAdapter';
import styles from './ChartWidget.module.css';

// A chart and its data editor, for any app: the drawn chart, and (while editing) a table to type
// numbers into, plus a box to paste a table from a spreadsheet or CSV. Plain DOM, no framework,
// so a note block (NoteEditor/extensions/Chart.ts) and a React component can host it alike: the
// host keeps the stored ChartSpec and hears about changes through onCommit; the widget owns the
// drawing and the editing. Typing redraws at once and commits after a pause, on leaving a cell, or
// at once for a change to the table's shape.

export interface ChartWidgetOptions {
  spec:      ChartSpec;
  kind:      ChartKind;
  editable:  boolean;
  editing?:  boolean;                          // open with the table showing
  onCommit:  (spec: ChartSpec) => void;        // a change to keep
  onEditingChange?: (editing: boolean) => void;
  onEscape?: () => void;                       // Esc in the table, after it closes
  height?:   number;                           // the chart's height in px (default 320)
}

const COMMIT_MS = 500;
export const isEmptyChart = (spec: ChartSpec) => spec.series.every((s) => s.values.every((v) => v === null));

export class ChartWidget {
  readonly dom: HTMLElement;
  private opts: ChartWidgetOptions;
  private spec: ChartSpec;
  private kind: ChartKind;
  private committed: string;
  private editingNow: boolean;
  private pasting = false;
  private canvas: HTMLCanvasElement;
  private empty: HTMLElement;
  private panel: HTMLElement;
  private handle: ChartHandle | null = null;
  private drawing = false;
  private redraw = false;
  private destroyed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private themeObserver: MutationObserver;

  constructor(opts: ChartWidgetOptions) {
    this.opts = opts;
    this.spec = normalizeChart(opts.spec);
    this.kind = opts.kind;
    this.committed = JSON.stringify(this.spec);
    this.editingNow = !!opts.editing && opts.editable;

    this.dom = el('div', styles.widget);
    const box = el('div', styles.box);
    if (opts.height) box.style.height = `${opts.height}px`;
    this.canvas = document.createElement('canvas');
    this.empty = el('div', styles.empty);
    this.empty.textContent = LABELS.charts.emptyHint;
    box.append(this.canvas, this.empty);
    this.panel = el('div', styles.panel);
    this.dom.append(box, this.panel);
    box.addEventListener('dblclick', () => { if (this.opts.editable) this.setEditing(true); });

    this.themeObserver = new MutationObserver(() => this.draw());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    this.renderPanel();
    this.empty.hidden = !isEmptyChart(this.spec);
    this.draw();
  }

  get editing() { return this.editingNow; }
  get current(): ChartSpec { return this.spec; }

  // The host's stored spec or kind changed. A spec that isn't what the widget last committed came
  // from elsewhere (undo, another device) and replaces the table; otherwise the cell being typed in
  // is left alone.
  update(spec: ChartSpec, kind: ChartKind) {
    const json = JSON.stringify(normalizeChart(spec));
    const outside = json !== this.committed;
    const kindChanged = kind !== this.kind;
    this.kind = kind;
    if (outside) { this.spec = normalizeChart(spec); this.committed = json; }
    if (this.editingNow && (outside || (kindChanged && !this.panel.contains(document.activeElement)))) this.renderPanel();
    this.empty.hidden = !isEmptyChart(this.spec);
    this.draw();
  }

  setEditing(on: boolean, focus = true) {
    if (this.editingNow === on || (on && !this.opts.editable)) return;
    if (!on) this.flush();
    this.editingNow = on;
    this.pasting = false;
    this.renderPanel();
    this.opts.onEditingChange?.(on);
    if (on && focus) this.focusCell('0:1');
  }

  openPaste() {
    if (!this.opts.editable) return;
    if (!this.editingNow) { this.editingNow = true; this.opts.onEditingChange?.(true); }
    this.pasting = true;
    this.renderPanel();
    requestAnimationFrame(() => this.panel.querySelector<HTMLTextAreaElement>('textarea')?.focus());
  }

  destroy() {
    this.flush();
    this.destroyed = true;
    this.themeObserver.disconnect();
    this.handle?.destroy();
  }

  // ── The table ──────────────────────────────────────────────────────────────

  private renderPanel() {
    this.panel.replaceChildren();
    this.panel.hidden = !this.editingNow;
    if (!this.editingNow) return;
    const L = LABELS.charts;
    const spec = this.spec;

    const head = el('div', styles.head);
    head.append(
      this.input(spec.title, L.titlePlaceholder, (v) => { this.spec.title = v; }, 'title', styles.titleInput),
      this.input(spec.yTitle, L.yTitlePlaceholder, (v) => { this.spec.yTitle = v; }, 'ytitle', styles.axisInput),
      this.button(L.paste, () => { this.pasting = !this.pasting; this.renderPanel(); if (this.pasting) requestAnimationFrame(() => this.panel.querySelector<HTMLTextAreaElement>('textarea')?.focus()); }, styles.pasteBtn),
    );
    if (this.kind === 'waterfall') {
      const label = el('label', styles.check);
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = spec.waterfallTotal;
      box.addEventListener('change', () => { this.spec.waterfallTotal = box.checked; this.change(true); });
      label.append(box, L.waterfallTotal);
      head.append(label);
    }
    this.panel.append(head);
    if (this.pasting) this.panel.append(this.pasteBox());

    const table = el('table', styles.table) as HTMLTableElement;
    const thead = table.createTHead().insertRow();
    thead.appendChild(document.createElement('th')).append(this.input(spec.xTitle, L.labelsHeading, (v) => { this.spec.xTitle = v; }, 'xtitle'));
    spec.series.forEach((s, k) => {
      const th = thead.appendChild(el('th', styles.seriesHead));
      th.style.setProperty('--series-color', seriesCssColor(k));
      th.append(this.input(s.name, L.seriesName(k + 1), (v) => { this.spec.series[k].name = v; }, `name:${k}`));
      if (spec.series.length > 1) th.append(this.button('×', () => this.edit((sp) => { sp.series.splice(k, 1); }), styles.deleteBtn, L.deleteSeries));
      if (k > 0 && SINGLE_SERIES.has(this.kind)) th.classList.add(styles.unused);
    });
    thead.appendChild(document.createElement('th')).append(this.button(`+ ${L.addSeries}`, () => this.edit((sp) => {
      sp.series.push({ name: L.seriesName(sp.series.length + 1), values: sp.labels.map(() => null) });
    }, `0:${spec.series.length + 1}`), styles.addBtn));

    const body = table.createTBody();
    spec.labels.forEach((label, r) => {
      const tr = body.insertRow();
      tr.insertCell().append(this.input(label, '', (v) => { this.spec.labels[r] = v; }, `${r}:0`));
      spec.series.forEach((s, k) => {
        const cell = this.input(s.values[r] === null ? '' : String(s.values[r]), '', (v) => { this.spec.series[k].values[r] = parseNumber(v); }, `${r}:${k + 1}`, styles.valueInput);
        cell.inputMode = 'decimal';
        tr.insertCell().append(cell);
      });
      const last = tr.insertCell();
      if (spec.labels.length > 1) last.append(this.button('×', () => this.edit((sp) => { sp.labels.splice(r, 1); sp.series.forEach((x) => x.values.splice(r, 1)); }), styles.deleteBtn, L.deleteRow));
    });
    const foot = table.createTFoot().insertRow().insertCell();
    foot.colSpan = spec.series.length + 2;
    foot.append(this.button(`+ ${L.addRow}`, () => this.addRow(), styles.addBtn));

    const hint = el('p', styles.hint);
    hint.textContent = SINGLE_SERIES.has(this.kind) && spec.series.length > 1 ? L.singleSeriesNote : L.tableHint;
    this.panel.append(table, hint);
  }

  // The paste box: prefilled with the data as a table, so it can be copied out as well as in.
  private pasteBox(): HTMLElement {
    const L = LABELS.charts;
    const wrap = el('div', styles.paste);
    const area = document.createElement('textarea');
    area.className = styles.pasteArea;
    area.value = isEmptyChart(this.spec) ? '' : chartToTable(this.spec);
    area.placeholder = L.pastePlaceholder;
    area.rows = 7;
    const hint = el('p', styles.hint);
    hint.textContent = L.pasteHint;
    const use = this.button(L.useData, () => submit(), styles.useBtn);
    const cancel = this.button(L.cancel, () => { this.pasting = false; this.renderPanel(); }, styles.addBtn);
    const submit = () => {
      const chart = tableToChart(parseDelimited(area.value), this.spec);
      this.pasting = false;
      if (chart) this.replace(chart); else this.renderPanel();
    };
    area.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.pasting = false; this.renderPanel(); }
    });
    const actions = el('div', styles.pasteActions);
    actions.append(use, cancel);
    wrap.append(area, hint, actions);
    return wrap;
  }

  private input(value: string, placeholder: string, onInput: (v: string) => void, cell: string, cls = ''): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `${styles.input} ${cls}`;
    input.value = value;
    input.placeholder = placeholder;
    input.dataset.chartCell = cell;
    input.addEventListener('input', () => { onInput(input.value); this.change(); });
    input.addEventListener('blur', () => this.flush());
    input.addEventListener('keydown', (e) => this.cellKey(e, cell));
    input.addEventListener('paste', (e) => this.cellPaste(e, cell));
    return input;
  }

  private button(label: string, onClick: () => void, cls: string, title?: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `${styles.btn} ${cls}`;
    b.textContent = label;
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
    return b;
  }

  // Enter moves down a row (adding one at the end), Shift+Enter up; Esc closes the table.
  private cellKey(e: KeyboardEvent, cell: string) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.setEditing(false);
      this.opts.onEscape?.();
      return;
    }
    const [r, c] = cell.split(':').map(Number);
    if (e.key !== 'Enter' || Number.isNaN(r)) return;
    e.preventDefault();
    e.stopPropagation();
    const next = r + (e.shiftKey ? -1 : 1);
    if (next < 0) return;
    if (next >= this.spec.labels.length) { this.addRow(c); return; }
    this.focusCell(`${next}:${c}`);
  }

  // A table pasted into a cell: into the headings, it replaces the data; into the body, it fills
  // from that cell on, adding rows and series as needed.
  private cellPaste(e: ClipboardEvent, cell: string) {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const rows = parseDelimited(text);
    const [r, c] = cell.split(':').map(Number);
    if (Number.isNaN(r)) {
      const chart = tableToChart(rows, this.spec);
      if (chart) this.replace(chart);
      return;
    }
    this.edit((sp) => {
      rows.forEach((row, i) => {
        const ri = r + i;
        while (sp.labels.length <= ri) { sp.labels.push(''); sp.series.forEach((s) => s.values.push(null)); }
        row.forEach((v, j) => {
          const ci = c + j;
          if (ci === 0) { sp.labels[ri] = v; return; }
          while (sp.series.length < ci) sp.series.push({ name: LABELS.charts.seriesName(sp.series.length + 1), values: sp.labels.map(() => null) });
          sp.series[ci - 1].values[ri] = parseNumber(v);
        });
      });
    });
  }

  private addRow(focusCol = 0) {
    const at = this.spec.labels.length;
    this.edit((sp) => { sp.labels.push(''); sp.series.forEach((s) => s.values.push(null)); }, `${at}:${focusCol}`);
  }

  // ── Saving ─────────────────────────────────────────────────────────────────

  private change(now = false) {
    this.empty.hidden = !isEmptyChart(this.spec);
    this.draw();
    if (this.timer) clearTimeout(this.timer);
    if (now) this.flush();
    else this.timer = setTimeout(() => this.flush(), COMMIT_MS);
  }

  private edit(fn: (spec: ChartSpec) => void, focus?: string) {
    const next = normalizeChart(JSON.parse(JSON.stringify(this.spec)));
    fn(next);
    this.replace(normalizeChart(next), focus);
  }

  private replace(spec: ChartSpec, focus?: string) {
    this.spec = spec;
    this.flush();
    this.renderPanel();
    this.empty.hidden = !isEmptyChart(this.spec);
    this.draw();
    if (focus) this.focusCell(focus);
  }

  private flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const json = JSON.stringify(this.spec);
    if (json === this.committed || this.destroyed) return;
    this.committed = json;
    this.opts.onCommit(JSON.parse(json));
  }

  private focusCell(cell: string) {
    requestAnimationFrame(() => (this.panel.querySelector<HTMLInputElement>(`input[data-chart-cell="${cell}"]`) ?? this.panel.querySelector<HTMLInputElement>('input'))?.focus());
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  // One draw at a time (the first loads the charting library); a draw asked for meanwhile runs
  // after it, with whatever is current then.
  private draw() {
    if (this.drawing) { this.redraw = true; return; }
    this.drawing = true;
    void (async () => {
      if (this.destroyed) return;
      const theme = readChartTheme();
      if (this.handle) this.handle.update(this.spec, this.kind, theme);
      else this.handle = await drawChart(this.canvas, this.spec, this.kind, theme, { total: LABELS.charts.total });
      if (this.destroyed) this.handle.destroy();
    })().finally(() => {
      this.drawing = false;
      if (this.redraw && !this.destroyed) { this.redraw = false; this.draw(); }
    });
  }
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
