import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { LABELS } from '@/config/labels';
import { CHART_KINDS, STACKABLE, type ChartKind, type ChartSpec, type ChartStacking, emptyChart, normalizeChart } from '@/charts/chartSpec';
import { ChartWidget, isEmptyChart } from '@/charts/ChartWidget';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, selectButton, type BlockDesign } from './blockDesigns';

// A chart in a note (`\chart`): one atom node holding a library-neutral ChartSpec (`spec`) and the
// chart type (`variant`, the block's design). Everything about charts that isn't about notes (the
// spec, drawing, the data table and paste box) is in src/charts/ and reused by other apps; this file
// is the block: its node, `\chart`, the pill, frames and selection.

export const CHART_DESIGNS: BlockDesign<ChartKind>[] = CHART_KINDS.map((id) => ({ id, label: LABELS.charts.kinds[id], icon: DESIGN_ICONS()[id] }));

function DESIGN_ICONS(): Record<ChartKind, string> {
  return {
    column:    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14h12"/><rect x="3" y="7" width="2.5" height="7"/><rect x="6.75" y="3" width="2.5" height="11"/><rect x="10.5" y="9" width="2.5" height="5"/></svg>',
    bar:       '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2v12"/><rect x="2" y="3" width="7" height="2.5"/><rect x="2" y="6.75" width="11" height="2.5"/><rect x="2" y="10.5" width="5" height="2.5"/></svg>',
    line:      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14h12"/><path d="M2.5 11 6 6.5l3 2.5 4.5-5.5"/></svg>',
    area:      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5V11L6 6.5l3 2.5 4.5-5.5v10Z" fill="currentColor" fill-opacity="0.3"/></svg>',
    pie:       '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14 8A6 6 0 1 1 2 8A6 6 0 1 1 14 8Z"/><path d="M8 2v6l4.6 3.8"/></svg>',
    doughnut:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14 8A6 6 0 1 1 2 8A6 6 0 1 1 14 8Z"/><path d="M10.6 8A2.6 2.6 0 1 1 5.4 8A2.6 2.6 0 1 1 10.6 8Z"/><path d="M8 2v3.4M10.1 9.6l2.6 2.2"/></svg>',
    scatter:   '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2v12h12"/><circle cx="5.5" cy="10" r="1"/><circle cx="8" cy="6.5" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="12.5" cy="4" r="1"/></svg>',
    waterfall: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14h12"/><rect x="2.5" y="8" width="2.4" height="6"/><rect x="5.6" y="4" width="2.4" height="4"/><rect x="8.7" y="4" width="2.4" height="3"/><rect x="11.8" y="7" width="2.4" height="7"/></svg>',
  };
}

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const Chart = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'column', parseHTML: (el) => oneOf(CHART_KINDS, el.getAttribute('data-variant'), 'column'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      spec: {
        default: null,
        parseHTML: (el) => { try { return normalizeChart(JSON.parse(el.getAttribute('data-spec') ?? 'null')); } catch { return emptyChart(); } },
        renderHTML: (a) => ({ 'data-spec': JSON.stringify(normalizeChart(a.spec)) }),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="chart"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'chart', 'data-note-block': '' })]; },

  addNodeView() {
    return ({ node, editor, getPos }) => new ChartView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

// ── Making and changing ──────────────────────────────────────────────────────

// `\chart`: replaces from..to (what was typed and the space before it) with an empty chart, its
// table open for the numbers.
export function insertChart(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.chart;
  if (!type) return null;
  const $start = state.doc.resolve(from);
  while (from > $start.start() && /\s/.test(state.doc.textBetween(from - 1, from))) from--;
  const node = type.create({ spec: emptyChart() });
  const tr = state.tr.delete(from, to);
  const $pos = tr.doc.resolve(from);
  const d = $pos.depth;
  let at: number | null = null;
  if ($pos.parent.isTextblock && $pos.parent.content.size === 0 && d > 0
    && $pos.node(d - 1).canReplaceWith($pos.index(d - 1), $pos.index(d - 1) + 1, type)) {
    at = $pos.before(d);
    tr.replaceWith(at, $pos.after(d), node);
  } else {
    for (let depth = d; depth > 0; depth--) {
      const index = $pos.indexAfter(depth - 1);
      if (!$pos.node(depth - 1).canReplaceWith(index, index, type)) continue;
      at = $pos.after(depth);
      tr.insert(at, node);
      break;
    }
  }
  if (at === null) return null;
  return tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView();
}

export type ChartSettings = Partial<{ variant: ChartKind; spec: ChartSpec }>;

export function setChartSettings(view: EditorView, pos: number, attrs: ChartSettings): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'chart') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

export function setChartStacking(view: EditorView, pos: number, stacking: ChartStacking): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'chart') return;
  setChartSettings(view, pos, { spec: { ...normalizeChart(node.attrs.spec), stacking } });
}

export function chartPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="chart"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0);
    for (const p of [pos, pos - 1]) if (view.state.doc.nodeAt(p)?.type.name === 'chart') return p;
    return null;
  } catch { return null; }
}

// Opens a chart's table (or its paste box) from outside its view (the right-click menu).
export function openChartData(view: EditorView, pos: number, paste = false): void {
  (view.nodeDOM(pos) as HTMLElement | null)?.dispatchEvent(new CustomEvent(paste ? 'chart-paste' : 'chart-edit'));
}


// ── The view ─────────────────────────────────────────────────────────────────
// The note's half only: the block's pill (type, stacking, data, frames, select) around the shared
// ChartWidget (src/charts/ChartWidget.ts), which draws the chart and edits its data. A change the
// widget commits becomes one setNodeMarkup, so it's one undo step and syncs with the note.

const STACKING_ORDER: ChartStacking[] = ['none', 'stacked', 'percent'];

class ChartView {
  dom: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;
  private pill: HTMLElement;
  private widget: ChartWidget;

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;
    const spec = normalizeChart(node.attrs.spec);

    this.dom = document.createElement('div');
    this.dom.setAttribute('data-type', 'chart');
    this.dom.setAttribute('data-note-block', '');
    this.dom.contentEditable = 'false';
    this.pill = document.createElement('div');
    this.widget = new ChartWidget({
      spec,
      kind: node.attrs.variant as ChartKind,
      editable: editor.isEditable,
      editing: isEmptyChart(spec),
      onCommit: (next) => {
        const pos = this.getPos();
        if (pos === undefined) return;
        const view = this.editor.view;
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, spec: next }));
      },
      onEditingChange: () => this.renderChrome(),
      onEscape: () => this.selectSelf(),
    });
    this.dom.append(this.pill, this.widget.dom);
    this.dom.addEventListener('chart-edit', () => this.widget.setEditing(true));
    this.dom.addEventListener('chart-paste', () => this.widget.openPaste());
    this.renderChrome();
  }

  private get kind(): ChartKind { return this.node.attrs.variant as ChartKind; }

  // Where the pill thinks it is: the shared pill buttons count from just inside the block.
  private pillPos = () => { const p = this.getPos(); return p === undefined ? undefined : p + 1; };

  private renderChrome() {
    const a = this.node.attrs;
    this.dom.setAttribute('data-variant', a.variant as string);
    this.dom.toggleAttribute('data-chart-editing', this.widget.editing);
    for (const f of ['outlined', 'shaded'] as const) {
      if (a[f]) this.dom.setAttribute(`data-${f}`, 'true'); else this.dom.removeAttribute(`data-${f}`);
    }
    const L = LABELS.noteBlocks.chart;
    const C = LABELS.charts;
    const view = this.editor.view;
    const getPos = this.pillPos;
    const spec = this.widget.current;
    const bar = blockPill('data-chart-tools');
    const set = (attrs: ChartSettings) => { const p = this.getPos(); if (p !== undefined && view.editable) setChartSettings(view, p, attrs); };
    const parts: HTMLElement[] = [designButtons(CHART_DESIGNS, this.kind, (v) => set({ variant: v }))];
    if (STACKABLE.has(this.kind) && spec.series.length > 1) {
      const next = STACKING_ORDER[(STACKING_ORDER.indexOf(spec.stacking) + 1) % STACKING_ORDER.length];
      const stack = pillButton(C.stackingTitle(C.stacking[spec.stacking]), () => set({ spec: { ...spec, stacking: next } }), C.stacking[spec.stacking]);
      stack.setAttribute('data-chart-tool', 'stacking');
      parts.push(stack);
    }
    const data = pillButton(L.editData, () => this.widget.setEditing(!this.widget.editing), L.data);
    data.setAttribute('data-chart-tool', 'data');
    data.setAttribute('aria-pressed', String(this.widget.editing));
    parts.push(data, frameButtons(view, getPos, a), selectButton(view, getPos));
    bar.append(...parts);
    this.pill.replaceWith(bar);
    this.pill = bar;
  }

  private selectSelf() {
    const pos = this.getPos();
    if (pos === undefined) return;
    const view = this.editor.view;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  }

  update(node: PMNode) {
    if (node.type.name !== 'chart') return false;
    this.node = node;
    this.widget.update(normalizeChart(node.attrs.spec), node.attrs.variant as ChartKind);
    this.renderChrome();
    return true;
  }

  stopEvent(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (this.widget.dom.contains(t) || !!t.closest('[data-chart-tools]'));
  }

  ignoreMutation() { return true; }

  destroy() { this.widget.destroy(); }
}

// Enter on a selected chart opens its table.
export const ChartBehaviour = Extension.create({
  name: 'chartBehaviour',
  priority: 110,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const sel = this.editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'chart') return false;
        openChartData(this.editor.view, sel.from);
        return true;
      },
    };
  },
});

export const ChartExtensions = [Chart, ChartBehaviour];
