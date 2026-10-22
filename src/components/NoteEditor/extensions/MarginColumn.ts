import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { Capacitor } from '@capacitor/core';
import { LABELS } from '@/config/labels';
import { useSettingsStore } from '@/store/settingsStore';
import { layoutMarginRows, spansLines, type MarginSpan } from '@/utils/marginLayout';
import { openBlockPopover, popoverClass } from './blockDesigns';

// The margin column (2026-10-17, designed with the user): a thin column at the right of the note
// where every line that holds a marked passage (Important, a Glossary link or chip, an Unsure flag)
// shows that mark's icon. It replaced the Important markers in the left margin and the braces and
// labels beside Glossary links. What a mark looks like in the text itself is unchanged.
//
// - Marks whose passages start on the same line share a row: up to three icons, then "+N"
//   (utils/marginLayout.ts). A passage over several lines gets a thin bracket down those lines.
// - Hovering an icon highlights its passage; clicking it opens that mark's own popover.
// - Collapsed, each row is a short coloured tick, and the column opens while hovered. 'auto'
//   (settingsStore.noteMarginColumn) opens it on a wide note and collapses it on a narrow one (side
//   by side, a phone); the button at its top opens or collapses it for good.
//
// A mark takes part by registering a source (registerMarginSource): from the editor state, its
// passages, each with an icon, a colour, a title and what a click does. A new kind of mark adds
// one source, never its own margin drawing.

export interface MarginItem {
  key:   string;                // stable per passage
  from:  number;
  to:    number;
  icon:  () => Node;            // a fresh element (or text) each time it's drawn
  color: string;                // a CSS colour: the mark's own colour, or a token
  title: string;
  open:  (view: EditorView, anchor: DOMRect) => void;
}

export type MarginSource = (state: EditorState) => MarginItem[];

const SOURCES = new Map<string, MarginSource>();
// Keyed by id, so re-registering (HMR) replaces it.
export function registerMarginSource(id: string, source: MarginSource): void { SOURCES.set(id, source); }

export const marginItems = (state: EditorState): MarginItem[] => [...SOURCES.values()].flatMap((s) => s(state));

const WIDE_MIN = 680;   // narrower than this, 'auto' keeps the column collapsed
const ICON = 22;
const ROW = ICON + 4;

const hoverKey = new PluginKey<{ key: string | null }>('marginColumnHover');

function setHover(view: EditorView, key: string | null) {
  if (!view.isDestroyed && hoverKey.getState(view.state)?.key !== key) view.dispatch(view.state.tr.setMeta(hoverKey, { key }));
}

const isOpen = (dom: HTMLElement): boolean => {
  const pref = useSettingsStore.getState().noteMarginColumn;
  if (pref !== 'auto') return pref === 'open';
  return Capacitor.getPlatform() !== 'android' && dom.clientWidth >= WIDE_MIN;
};

class MarginColumnView {
  private layer: HTMLDivElement;
  private frame = 0;
  private observer: ResizeObserver | null;
  private unsubscribe: () => void;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.layer = document.createElement('div');
    this.layer.setAttribute('data-margin-column', '');
    view.dom.parentElement?.appendChild(this.layer);
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.schedule());
    this.observer?.observe(view.dom);
    this.unsubscribe = useSettingsStore.subscribe((s, p) => { if (s.noteMarginColumn !== p.noteMarginColumn) this.schedule(); });
    this.schedule();
  }

  update(view: EditorView) {
    this.view = view;
    this.schedule();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.unsubscribe();
    this.layer.remove();
    delete (this.view.dom as HTMLElement).dataset.marginMode;
  }

  // Also redrawn when something a source reads changes outside the document (a Glossary entry
  // renamed, a vault unlocked): any extension can ask through refreshMarginColumns().
  schedule() {
    if (this.frame || typeof requestAnimationFrame === 'undefined') return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

  private draw() {
    const view = this.view;
    if (view.isDestroyed) return;
    const dom = view.dom as HTMLElement;
    const items = marginItems(view.state);
    if (items.length === 0) {
      this.layer.replaceChildren();
      delete dom.dataset.marginMode;
      return;
    }
    const open = isOpen(dom);
    const mode = open ? 'open' : 'closed';
    if (dom.dataset.marginMode !== mode) dom.dataset.marginMode = mode;
    this.layer.toggleAttribute('data-open', open);

    // Positions in the layer's own (unzoomed) pixels: the editor may be CSS-zoomed.
    const layerRect = this.layer.getBoundingClientRect();
    const zoom = this.layer.offsetWidth ? layerRect.width / this.layer.offsetWidth || 1 : 1;
    const domRect = dom.getBoundingClientRect();
    const textRight = (domRect.left - layerRect.left) / zoom + dom.clientWidth - parseFloat(getComputedStyle(dom).paddingRight || '0');
    const lineHeight = parseFloat(getComputedStyle(dom).lineHeight) || 24;

    const byKey = new Map(items.map((i) => [i.key, i]));
    const spans: MarginSpan[] = [];
    for (const i of items) {
      try {
        spans.push({
          key: i.key,
          top: (view.coordsAtPos(i.from, 1).top - layerRect.top) / zoom,
          bottom: (view.coordsAtPos(i.to, -1).bottom - layerRect.top) / zoom,
        });
      } catch { /* not laid out */ }
    }
    const spanOf = new Map(spans.map((s) => [s.key, s]));
    const rows = layoutMarginRows(spans, ROW);

    const out = document.createDocumentFragment();
    const column = document.createElement('div');
    column.setAttribute('data-margin-strip', '');
    column.style.left = `${textRight + 6}px`;
    column.append(this.toggle(open));

    rows.forEach((row, r) => {
      // The brackets for passages over several lines, side by side so none hides another.
      row.keys.forEach((key, n) => {
        const s = spanOf.get(key);
        const item = byKey.get(key);
        if (!s || !item || !spansLines(s, lineHeight)) return;
        const bracket = document.createElement('span');
        bracket.setAttribute('data-margin-bracket', '');
        bracket.style.cssText = `left: ${n * 3}px; top: ${s.top}px; height: ${s.bottom - s.top}px; --mark-color: ${item.color}`;
        column.append(bracket);
      });
      const tick = document.createElement('span');
      tick.setAttribute('data-margin-tick', '');
      const first = byKey.get(row.keys[0]);
      tick.style.cssText = `top: ${row.top}px; height: ${ICON}px; --mark-color: ${first?.color ?? 'var(--color-muted)'}`;
      // On touch there's no hover to open the column: a tap on the tick opens the line's first mark.
      tick.addEventListener('mousedown', (e) => e.preventDefault());
      tick.addEventListener('click', (e) => { e.preventDefault(); if (first) first.open(this.view, tick.getBoundingClientRect()); });
      column.append(tick);

      const icons = document.createElement('div');
      icons.setAttribute('data-margin-row', '');
      icons.style.top = `${row.top}px`;
      for (const key of row.keys) {
        const item = byKey.get(key);
        if (item) icons.append(this.iconButton(item));
      }
      if (row.more.length) icons.append(this.moreButton(row.more.map((k) => byKey.get(k)).filter((i): i is MarginItem => !!i), r));
      column.append(icons);
    });
    out.append(column);
    this.layer.replaceChildren(out);
  }

  private toggle(open: boolean): HTMLElement {
    const L = LABELS.marginColumn;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-margin-toggle', '');
    b.title = open ? L.collapse : L.open;
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? '›' : '‹';
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.preventDefault(); useSettingsStore.getState().setNoteMarginColumn(open ? 'closed' : 'open'); });
    return b;
  }

  private iconButton(item: MarginItem): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-margin-icon', '');
    b.style.setProperty('--mark-color', item.color);
    b.title = item.title;
    b.setAttribute('aria-label', item.title);
    b.append(item.icon());
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('mouseenter', () => setHover(this.view, item.key));
    b.addEventListener('mouseleave', () => setHover(this.view, null));
    b.addEventListener('click', (e) => { e.preventDefault(); setHover(this.view, null); item.open(this.view, b.getBoundingClientRect()); });
    return b;
  }

  // "+N": the rest of a row's marks, in a popover, each opening as its icon would.
  private moreButton(rest: MarginItem[], row: number): HTMLElement {
    const L = LABELS.marginColumn;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-margin-more', String(row));
    b.textContent = `+${rest.length}`;
    b.title = L.more(rest.length);
    b.setAttribute('aria-label', b.title);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      const view = this.view;
      openBlockPopover(b.getBoundingClientRect(), (close) => {
        const list = document.createElement('div');
        list.className = popoverClass.row;
        list.setAttribute('data-margin-more-list', '');
        for (const item of rest) {
          const choice = document.createElement('button');
          choice.type = 'button';
          choice.className = popoverClass.choice;
          choice.append(item.icon(), ` ${item.title}`);
          choice.addEventListener('mousedown', (ev) => ev.preventDefault());
          choice.addEventListener('click', () => { close(); item.open(view, b.getBoundingClientRect()); });
          list.append(choice);
        }
        return list;
      });
    });
    return b;
  }
}

const views = new Set<MarginColumnView>();
// Something a source reads outside the document changed: every open editor redraws its column.
export const refreshMarginColumns = () => { for (const v of views) v.schedule(); };

// The passage of the hovered icon is highlighted.
function hoverDecorations(state: EditorState): DecorationSet | null {
  const key = hoverKey.getState(state)?.key;
  if (!key) return null;
  const item = marginItems(state).find((i) => i.key === key);
  if (!item || item.from >= item.to) return null;
  return DecorationSet.create(state.doc, [Decoration.inline(item.from, item.to, { 'data-margin-hover': '' })]);
}

export const MarginColumn = Extension.create({
  name: 'marginColumn',

  addProseMirrorPlugins() {
    return [new Plugin<{ key: string | null }>({
      key: hoverKey,
      state: {
        init: () => ({ key: null }),
        apply: (tr, value) => (tr.getMeta(hoverKey) as { key: string | null } | undefined) ?? value,
      },
      view: (view) => {
        const v = new MarginColumnView(view);
        views.add(v);
        return { update: (next) => v.update(next), destroy: () => { views.delete(v); v.destroy(); } };
      },
      props: { decorations: hoverDecorations },
    })];
  },
});
