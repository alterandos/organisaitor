import { Extension } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { ContextMenuItem } from '@/contextMenu/types';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { registerEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import { SWATCH_IDS } from '@/config/swatches';
import { createElement } from 'react';
import { TrashIcon } from '@/components/Icons';
import styles from './BlockDesigns.module.css';

// ── Blocks with their own inputs take the typing ─────────────────────────────
// A block that is one unit (an atom) but has inputs of its own (maths, a chart's table, a Glossary
// card) is drawn a moment after it's put in, and is selected whole until its input has focus. A key
// typed then would replace the selected block, as typing over selected text does. This plugin hands
// such keys to the block instead (`open`: focus its input and type `text`, or open it for editing).
// Every such block uses it (CLAUDE.md "Blocks with their own inputs"; pattern test).
export function typeIntoBlockPlugin(nodeNames: string[], open: (view: EditorView, pos: number, text: string) => void): Plugin {
  const selected = (state: EditorState): number | null => {
    const sel = state.selection;
    return sel instanceof NodeSelection && nodeNames.includes(sel.node.type.name) ? sel.from : null;
  };
  return new Plugin({
    props: {
      handleKeyDown: (view, e) => {
        const pos = selected(view.state);
        if (pos === null || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;
        e.preventDefault();
        open(view, pos, e.key);
        return true;
      },
      handleTextInput: (view, _from, _to, text) => {
        const pos = selected(view.state);
        if (pos === null) return false;
        open(view, pos, text);
        return true;
      },
    },
  });
}

// ── Putting a block in ───────────────────────────────────────────────────────

// Puts `node` in place of the empty textblock at `from`, or after the block it's in (or the
// nearest container that can hold it). Returns where it went, or null if nothing can hold it.
export function placeBlock(tr: Transaction, from: number, node: PMNode): number | null {
  const $pos = tr.doc.resolve(from);
  const d = $pos.depth;
  if ($pos.parent.isTextblock && $pos.parent.content.size === 0 && d > 0
    && $pos.node(d - 1).canReplaceWith($pos.index(d - 1), $pos.index(d - 1) + 1, node.type)) {
    const at = $pos.before(d);
    tr.replaceWith(at, $pos.after(d), node);
    return at;
  }
  for (let depth = d; depth > 0; depth--) {
    const index = $pos.indexAfter(depth - 1);
    if (!$pos.node(depth - 1).canReplaceWith(index, index, node.type)) continue;
    const at = $pos.after(depth);
    tr.insert(at, node);
    return at;
  }
  return null;
}

// `\<block>`: takes out what was typed (from..to) and the spaces before it ("History \timeline" →
// "History"), and puts the block in (placeBlock). Every block's insert goes through this; the
// block then puts the cursor where its writing starts.
export function replaceTypedWithBlock(state: EditorState, from: number, to: number, node: PMNode): { tr: Transaction; at: number } | null {
  const $start = state.doc.resolve(from);
  while (from > $start.start() && /\s/.test(state.doc.textBetween(from - 1, from))) from--;
  const tr = state.tr.delete(from, to);
  const at = placeBlock(tr, from, node);
  return at === null ? null : { tr, at };
}

// ── Spectrum colours ─────────────────────────────────────────────────────────

// The spread of colours a block's parts take in its "spectrum" colouring (cycle stages, breakdown
// parts, pyramid layers): `t` is how far along (0 = first), `span` how much of the colour wheel the
// whole block covers. Computed when drawing, never stored.
export const spectrumColour = (t: number, span = 360): string => `hsl(${Math.round((210 + t * span) % 360)} 62% 52%)`;

// ── Frames: outline and shade ────────────────────────────────────────────────
// Any block can be outlined, shaded, or both. The frame is drawn outside the block's own box (an
// outline at an offset and a spread shadow, CSS keyed on data-outlined / data-shaded), so no
// design's layout changes when it's framed. Each has options: the outline's colour, shape, line
// and thickness; the shade's colour. A colour is a swatch (a theme token, so it suits both themes)
// or a custom #rrggbb.

export type BlockFrame = 'outlined' | 'shaded';
export const BLOCK_FRAMES: BlockFrame[] = ['outlined', 'shaded'];

// The suite's one palette (config/swatches.ts), stored by id so the dark theme gets its own value.
export const FRAME_SWATCHES = SWATCH_IDS;
export const FRAME_SHAPES = ['square', 'rounded', 'pill', 'circle'] as const;
export type FrameShape = typeof FRAME_SHAPES[number];
export const OUTLINE_STYLES = ['solid', 'dashed', 'dotted', 'double'] as const;
export type OutlineStyle = typeof OUTLINE_STYLES[number];
export const OUTLINE_WIDTHS = ['thin', 'medium', 'thick'] as const;
export type OutlineWidth = typeof OUTLINE_WIDTHS[number];

// A stored colour, or null when it isn't one we draw (pasted HTML can carry anything).
export function frameColour(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return (FRAME_SWATCHES as readonly string[]).includes(v) || /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}

// The CSS for a stored colour.
export const frameColourCss = (c: string) => (c.startsWith('#') ? c : `var(--color-swatch-${c})`);

const oneOfAttr = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

// Spread into a block node's addAttributes().
export const blockFrameAttributes = () => ({
  outlined: {
    default: false,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-outlined') === 'true',
    renderHTML: (attrs: Record<string, unknown>) => (attrs.outlined ? { 'data-outlined': 'true' } : {}),
  },
  shaded: {
    default: false,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-shaded') === 'true',
    renderHTML: (attrs: Record<string, unknown>) => (attrs.shaded ? { 'data-shaded': 'true' } : {}),
  },
  outlineColor: {
    default: null,
    parseHTML: (el: HTMLElement) => frameColour(el.getAttribute('data-outline-color')),
    renderHTML: (attrs: Record<string, unknown>) => {
      const c = frameColour(attrs.outlineColor);
      return c ? { 'data-outline-color': c, style: `--frame-outline: ${frameColourCss(c)}` } : {};
    },
  },
  shadeColor: {
    default: null,
    parseHTML: (el: HTMLElement) => frameColour(el.getAttribute('data-shade-color')),
    renderHTML: (attrs: Record<string, unknown>) => {
      const c = frameColour(attrs.shadeColor);
      return c ? { 'data-shade-color': c, style: `--frame-shade: ${frameColourCss(c)}` } : {};
    },
  },
  frameShape: {
    default: 'square',
    parseHTML: (el: HTMLElement) => oneOfAttr(FRAME_SHAPES, el.getAttribute('data-frame-shape'), 'square'),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.frameShape && attrs.frameShape !== 'square' ? { 'data-frame-shape': String(attrs.frameShape) } : {}),
  },
  outlineStyle: {
    default: 'solid',
    parseHTML: (el: HTMLElement) => oneOfAttr(OUTLINE_STYLES, el.getAttribute('data-outline-style'), 'solid'),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.outlineStyle && attrs.outlineStyle !== 'solid' ? { 'data-outline-style': String(attrs.outlineStyle) } : {}),
  },
  outlineWidth: {
    default: 'thin',
    parseHTML: (el: HTMLElement) => oneOfAttr(OUTLINE_WIDTHS, el.getAttribute('data-outline-width'), 'thin'),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.outlineWidth && attrs.outlineWidth !== 'thin' ? { 'data-outline-width': String(attrs.outlineWidth) } : {}),
  },
});

const FRAME_DOM_ATTRS = ['data-outlined', 'data-shaded', 'data-outline-color', 'data-shade-color', 'data-frame-shape', 'data-outline-style', 'data-outline-width'];

// For a block drawn by its own node view (chart, code, maths): puts the frame attributes on its
// DOM, as renderHTML does for the others.
export function applyFrameAttrs(dom: HTMLElement, attrs: Record<string, unknown>): void {
  for (const a of FRAME_DOM_ATTRS) dom.removeAttribute(a);
  dom.style.removeProperty('--frame-outline');
  dom.style.removeProperty('--frame-shade');
  for (const spec of Object.values(blockFrameAttributes())) {
    for (const [k, v] of Object.entries(spec.renderHTML(attrs) as Record<string, string>)) {
      if (k !== 'style') { dom.setAttribute(k, v); continue; }
      const at = v.indexOf(':');
      dom.style.setProperty(v.slice(0, at).trim(), v.slice(at + 1).trim());
    }
  }
}

export type FrameSettings = Partial<{
  outlined: boolean; shaded: boolean; outlineColor: string | null; shadeColor: string | null;
  frameShape: FrameShape; outlineStyle: OutlineStyle; outlineWidth: OutlineWidth;
}>;

// Changes a block's frame. Choosing an outline option turns the outline on, a shade colour the shade.
export function setBlockFrame(view: EditorView, pos: number, settings: FrameSettings): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !NOTE_BLOCK_NODES.has(node.type.name)) return;
  const next: FrameSettings = { ...settings };
  if (next.outlined === undefined && ('outlineColor' in next || 'frameShape' in next || 'outlineStyle' in next || 'outlineWidth' in next)) next.outlined = true;
  if (next.shaded === undefined && 'shadeColor' in next) next.shaded = true;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next }));
}

export function toggleBlockFrame(view: EditorView, pos: number, frame: BlockFrame): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !NOTE_BLOCK_NODES.has(node.type.name)) return;
  setBlockFrame(view, pos, { [frame]: !node.attrs[frame] });
}

// A circle only fits a block about as tall as it is wide (the ring cycle); elsewhere it isn't offered.
export function circleFits(dom: Element | null): boolean {
  if (!dom) return false;
  const r = dom.getBoundingClientRect();
  return r.width > 0 && Math.abs(r.width - r.height) / Math.max(r.width, r.height) < 0.2;
}

const FRAME_ICONS: Record<BlockFrame | 'options', string> = {
  outlined: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2.5"/></svg>',
  shaded:   '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2.5" fill="currentColor" fill-opacity="0.28" stroke="none"/></svg>',
  options:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2a5.8 5.8 0 1 0 0 11.6c.9 0 1.3-.6 1.1-1.3l-.2-.6c-.3-.8.3-1.6 1.1-1.6h1.3a2.5 2.5 0 0 0 2.5-2.5C13.8 4.6 11.2 2.2 8 2.2Z"/><circle cx="5.2" cy="7" r="0.9"/><circle cx="7.6" cy="4.9" r="0.9"/><circle cx="10.4" cy="5.6" r="0.9"/></svg>',
};

// The pill's frame toggles, and the button that opens the frame's options. `getPos` is the pill
// widget's; the block starts just before it.
export function frameButtons(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const group = document.createElement('span');
  group.setAttribute('data-block-frames', '');
  for (const frame of BLOCK_FRAMES) {
    const b = pillButton(LABELS.noteBlocks.frames[frame], () => { const p = getPos(); if (p !== undefined) toggleBlockFrame(view, p - 1, frame); });
    b.setAttribute('data-block-frame', frame);
    b.setAttribute('aria-pressed', String(!!attrs[frame]));
    b.innerHTML = FRAME_ICONS[frame];
    group.append(b);
  }
  const more = pillButton(LABELS.noteBlocks.frameOptions.title, (e) => {
    const p = getPos();
    if (p !== undefined) openFrameOptions(view, p - 1, (e.currentTarget as HTMLElement).getBoundingClientRect());
  });
  more.setAttribute('data-block-frame', 'options');
  more.innerHTML = FRAME_ICONS.options;
  group.append(more);
  return group;
}

// The frame's options, in a popover: the outline's colour, shape, line and thickness, and the
// shade's colour. Stays open while choosing, so options can be tried one after another.
export function openFrameOptions(view: EditorView, pos: number, anchor: DOMRect): () => void {
  const L = LABELS.noteBlocks.frameOptions;
  return openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    box.setAttribute('data-frame-options', '');
    const render = () => {
      const node = view.state.doc.nodeAt(pos);
      if (!node || !NOTE_BLOCK_NODES.has(node.type.name)) { close(); return; }
      const a = node.attrs;
      const set = (s: FrameSettings) => { setBlockFrame(view, pos, s); render(); };
      const heading = (text: string) => { const h = document.createElement('div'); h.className = styles.heading; h.textContent = text; return h; };
      const chips = <V extends string>(values: readonly V[], current: V, label: (v: V) => string, pick: (v: V) => void) => {
        const row = document.createElement('div');
        row.className = styles.row;
        for (const v of values) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = styles.choice;
          b.textContent = label(v);
          b.setAttribute('aria-pressed', String(v === current));
          b.addEventListener('click', () => pick(v));
          row.append(b);
        }
        return row;
      };
      const shapes = FRAME_SHAPES.filter((s) => s !== 'circle' || a.frameShape === 'circle' || circleFits(view.nodeDOM(pos) as Element | null));
      box.replaceChildren(
        toggleRow(L.outline, !!a.outlined, () => set({ outlined: !a.outlined })),
        swatchRow(frameColour(a.outlineColor), (c) => set({ outlineColor: c })),
        heading(L.shape),
        chips(shapes, a.frameShape as FrameShape, (v) => L.shapes[v], (v) => set({ frameShape: v })),
        heading(L.line),
        chips(OUTLINE_STYLES, a.outlineStyle as OutlineStyle, (v) => L.styles[v], (v) => set({ outlineStyle: v })),
        chips(OUTLINE_WIDTHS, a.outlineWidth as OutlineWidth, (v) => L.widths[v], (v) => set({ outlineWidth: v })),
        toggleRow(L.shade, !!a.shaded, () => set({ shaded: !a.shaded })),
        swatchRow(frameColour(a.shadeColor), (c) => set({ shadeColor: c })),
      );
    };
    render();
    return box;
  });
}

function toggleRow(label: string, on: boolean, toggle: () => void): HTMLElement {
  const row = document.createElement('label');
  row.className = styles.toggleRow;
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = on;
  box.addEventListener('change', toggle);
  row.append(box, document.createTextNode(label));
  return row;
}

// The swatches, a "default" swatch (the theme's quiet colour) and a custom colour.
function swatchRow(current: string | null, pick: (c: string | null) => void): HTMLElement {
  const L = LABELS.noteBlocks.frameOptions;
  const row = document.createElement('div');
  row.className = styles.swatches;
  const swatch = (value: string | null, title: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = styles.swatch;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('aria-pressed', String(value === current));
    if (value) b.style.setProperty('--swatch', frameColourCss(value));
    else b.setAttribute('data-default', '');
    b.addEventListener('click', () => pick(value));
    return b;
  };
  row.append(swatch(null, L.defaultColour));
  for (const s of FRAME_SWATCHES) row.append(swatch(s, LABELS.swatches[s]));
  const custom = document.createElement('input');
  custom.type = 'color';
  custom.className = styles.customColour;
  custom.title = L.customColour;
  custom.setAttribute('aria-label', L.customColour);
  if (current?.startsWith('#')) { custom.value = current; custom.setAttribute('data-current', ''); }
  custom.addEventListener('change', () => pick(custom.value));
  row.append(custom);
  return row;
}

// How far a block's parts reach outside its own box, in whole px (0 when nothing does). Some
// designs draw past their box on purpose (the ring's side cards hang over its edge), and a frame
// drawn at a fixed distance from the box would cut through them.
export function frameOverflow(box: DOMRect, parts: DOMRect[]): number {
  let out = 0;
  for (const r of parts) {
    if (!r.width && !r.height) continue;
    out = Math.max(out, box.left - r.left, r.right - box.right, box.top - r.top, r.bottom - box.bottom);
  }
  return Math.ceil(out);
}

// The boxes of what a block shows: not the pill (it sits on the frame's edge on purpose), and
// nothing inside a part that clips its content (a design that scrolls sideways).
function visibleParts(root: Element): DOMRect[] {
  const out: DOMRect[] = [];
  const walk = (el: Element) => {
    for (const child of el.children) {
      if (child.hasAttribute('data-block-tools')) continue;
      out.push(child.getBoundingClientRect());
      const s = getComputedStyle(child);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') walk(child);
    }
  };
  const s = getComputedStyle(root);
  if (s.overflowX === 'visible' && s.overflowY === 'visible') walk(root);
  return out;
}

// Fits each framed block's frame around everything it draws: after each render (and on resize)
// it measures the overflow and widens the frame by it, through a node decoration (--frame-overflow)
// so ProseMirror doesn't read the style change as an edit.
const frameFitKey = new PluginKey<Map<number, number>>('blockFrameFit');

class FrameFit {
  private frame = 0;
  private observer: ResizeObserver | null;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.schedule());
    this.observer?.observe(view.dom);
    this.schedule();
  }

  update(view: EditorView) { this.view = view; this.schedule(); }

  destroy() { cancelAnimationFrame(this.frame); this.observer?.disconnect(); }

  private schedule() {
    if (this.frame || typeof requestAnimationFrame === 'undefined') return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.measure(); });
  }

  private measure() {
    const view = this.view;
    if (view.isDestroyed) return;
    const next = new Map<number, number>();
    view.state.doc.descendants((node, pos) => {
      if (!NOTE_BLOCK_NODES.has(node.type.name)) return true;
      if (!node.attrs.outlined && !node.attrs.shaded) return false;
      const dom = view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) return false;
      const out = frameOverflow(dom.getBoundingClientRect(), visibleParts(dom));
      if (out > 0) next.set(pos, out);
      return false;
    });
    const prev = frameFitKey.getState(view.state) ?? new Map();
    const same = prev.size === next.size && [...next].every(([p, v]) => prev.get(p) === v);
    if (!same) view.dispatch(view.state.tr.setMeta(frameFitKey, next).setMeta('addToHistory', false));
  }
}

const frameFitPlugin = () => new Plugin<Map<number, number>>({
  key: frameFitKey,
  state: {
    init: () => new Map(),
    apply(tr, value) {
      const fresh = tr.getMeta(frameFitKey) as Map<number, number> | undefined;
      if (fresh) return fresh;
      if (!tr.docChanged) return value;
      const moved = new Map<number, number>();
      for (const [p, v] of value) { const m = tr.mapping.mapResult(p); if (!m.deleted) moved.set(m.pos, v); }
      return moved;
    },
  },
  props: {
    decorations(state) {
      const fits = frameFitKey.getState(state);
      if (!fits?.size) return null;
      const decos: Decoration[] = [];
      for (const [pos, px] of fits) {
        const node = state.doc.nodeAt(pos);
        if (node && NOTE_BLOCK_NODES.has(node.type.name)) decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `--frame-overflow: ${px}px` }));
      }
      return DecorationSet.create(state.doc, decos);
    },
  },
  view: (view) => new FrameFit(view),
});

// Frame ▸ in the block's right-click menu: the two toggles, then the outline's and the shade's
// options (one level deeper), then everything at once in the popover (where a custom colour is).
export function frameMenuItem(view: EditorView, pos: number, attrs: Record<string, unknown>): ContextMenuItem {
  const L = LABELS.noteBlocks.frameOptions;
  const tick = (on: boolean) => (on ? '✓' : undefined);
  const colours = (key: 'outlineColor' | 'shadeColor', current: string | null): ContextMenuItem[][] => [
    [{ id: `${key}-default`, label: L.defaultColour, icon: tick(current === null), run: () => setBlockFrame(view, pos, { [key]: null }) }],
    FRAME_SWATCHES.map((s) => ({
      id: `${key}-${s}`,
      label: LABELS.swatches[s],
      icon: current === s ? '✓' : createElement('span', { 'data-menu-swatch': '', style: { background: frameColourCss(s) } }),
      run: () => setBlockFrame(view, pos, { [key]: s }),
    })),
  ];
  const dom = view.nodeDOM(pos) as Element | null;
  const shapes = FRAME_SHAPES.filter((s) => s !== 'circle' || attrs.frameShape === 'circle' || circleFits(dom));
  return {
    id: 'block-frame',
    label: LABELS.noteBlocks.frame,
    icon: '▢',
    submenu: [
      BLOCK_FRAMES.map((f) => ({ id: `frame-${f}`, label: LABELS.noteBlocks.frames[f], icon: tick(!!attrs[f]), run: () => toggleBlockFrame(view, pos, f) })),
      [
        { id: 'frame-outline-colour', label: L.outlineColour, icon: '◌', submenu: colours('outlineColor', frameColour(attrs.outlineColor)) },
        { id: 'frame-shape', label: L.shape, icon: '⬭', submenu: [shapes.map((s) => ({ id: `frame-shape-${s}`, label: L.shapes[s], icon: tick(attrs.frameShape === s), run: () => setBlockFrame(view, pos, { frameShape: s }) }))] },
        {
          id: 'frame-line', label: L.line, icon: '┄',
          submenu: [
            OUTLINE_STYLES.map((s) => ({ id: `frame-style-${s}`, label: L.styles[s], icon: tick(attrs.outlineStyle === s), run: () => setBlockFrame(view, pos, { outlineStyle: s }) })),
            OUTLINE_WIDTHS.map((w) => ({ id: `frame-width-${w}`, label: L.widths[w], icon: tick(attrs.outlineWidth === w), run: () => setBlockFrame(view, pos, { outlineWidth: w }) })),
          ],
        },
        { id: 'frame-shade-colour', label: L.shadeColour, icon: '◍', submenu: colours('shadeColor', frameColour(attrs.shadeColor)) },
      ],
      [{
        id: 'frame-options', label: L.more, icon: '…',
        run: () => { const el = view.nodeDOM(pos) as Element | null; if (el) openFrameOptions(view, pos, el.getBoundingClientRect()); },
      }],
    ],
  };
}

// ── Selecting a whole block ──────────────────────────────────────────────────
// Any note block can be selected as one piece (to cut, copy or delete it): the Select button in
// its pill, Select whole block in its right-click menu, or Esc while the cursor is inside it. A
// block's root node is in NOTE_BLOCK_NODES and its DOM carries data-note-block.

export const NOTE_BLOCK_NODES = new Set(['timeline', 'quoteBlock', 'cycle', 'breakdown', 'hierarchy', 'pyramid', 'chart', 'codeBlock', 'mathBlock', 'inbox', 'glossaryCard', 'hub']);

// The note block the selection is inside (the outermost, if blocks were ever nested), or null.
export function blockAround(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let d = 1; d <= $from.depth; d++) {
    if (NOTE_BLOCK_NODES.has($from.node(d).type.name)) return $from.before(d);
  }
  return null;
}

export function selectBlock(view: EditorView, pos: number): void {
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).scrollIntoView());
  view.focus();
}

// Deletes the whole block (Ctrl+Z brings it back).
export function deleteBlock(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !NOTE_BLOCK_NODES.has(node.type.name)) return;
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
  view.focus();
}

// The block a DOM element is in, as a document position.
export function blockPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-note-block]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    const node = view.state.doc.nodeAt(pos);
    return node && NOTE_BLOCK_NODES.has(node.type.name) ? pos : null;
  } catch { return null; }
}

const SELECT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v2M14 11v2a1 1 0 0 1-1 1h-2M5 14H3a1 1 0 0 1-1-1v-2M7 2h2M7 14h2M2 7v2M14 7v2"/></svg>';
// The trash can of components/Icons (TrashIcon), as markup: the pill is plain DOM, not React.
const DELETE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

// The pill's Select button, and its Delete button (shown only while the block is selected, CSS).
// Every block's pill ends with these (pattern test). `getPos` is the pill widget's; the block
// starts just before it.
export function selectButton(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const group = document.createElement('span');
  group.setAttribute('data-block-select-group', '');
  const select = pillButton(LABELS.noteBlocks.selectBlock, () => {
    const p = getPos();
    if (p !== undefined) selectBlock(view, p - 1);
  });
  select.setAttribute('data-block-select', '');
  select.innerHTML = SELECT_ICON;
  const del = pillButton(LABELS.noteBlocks.deleteBlock, () => {
    const p = getPos();
    if (p !== undefined) deleteBlock(view, p - 1);
  });
  del.setAttribute('data-block-delete', '');
  del.innerHTML = DELETE_ICON;
  group.append(select, del);
  return group;
}

// Esc inside a block selects the whole block (as in Notion); Esc again then goes on to whatever
// is around the editor. Below the default priority, so a `\` session (NoteObjectTrigger), which
// owns Esc while it's open, sees it first.
export const NoteBlockSelect = Extension.create({
  name: 'noteBlockSelect',
  priority: 90,

  addProseMirrorPlugins() {
    return [frameFitPlugin()];
  },

  addKeyboardShortcuts() {
    return {
      Escape: () => {
        const { state, view } = this.editor;
        if (state.selection instanceof NodeSelection) return false;
        const pos = blockAround(state);
        if (pos === null) return false;
        selectBlock(view, pos);
        return true;
      },
    };
  },
});

registerContextMenuProvider({
  id: 'note-editor.block-select',
  kind: 'note-editor',
  order: 7,
  when: (ctx) => !!ctx.target.closest('[data-note-block]'),
  items: (ctx, scope) => {
    const view = (scope.data as { editor: { view: EditorView } }).editor.view;
    const pos = blockPosAt(view, ctx.target);
    if (pos === null) return [];
    return [
      { id: 'select-block', label: LABELS.noteBlocks.selectBlock, icon: '⬚', shortcut: 'Esc', run: () => selectBlock(view, pos) },
      { id: 'delete-block', label: LABELS.noteBlocks.deleteBlock, icon: createElement(TrashIcon), destructive: true, run: () => deleteBlock(view, pos) },
    ];
  },
});

// Block designs (CLAUDE.md "Block designs"): every note block (timeline, quote, cycle…) offers
// several designs of the same content, chosen from the pill at its top right or from Design ▸ in
// its right-click menu. A design is the block's `variant` attribute plus its CSS under
// [data-variant="…"]; the content never changes, so switching is always safe. This module is the
// shared half: the design list's shape, the pill and its buttons, the Design ▸ menu, and the small
// popover a block opens from its pill or its parts (a cycle's arrow, an icon slot).

export interface BlockDesign<V extends string = string> {
  id:    V;
  label: string;
  icon:  string;   // a small line drawing (SVG markup, stroked in currentColor by the CSS)
}

// The pill: shown on hover, while the block is being edited and always on touch (the CSS keys on
// data-block-tools). `attr` is the block's own attribute, which only places it.
export function blockPill(attr: string): HTMLDivElement {
  const bar = document.createElement('div');
  bar.contentEditable = 'false';
  bar.setAttribute(attr, '');
  bar.setAttribute('data-block-tools', '');
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  return bar;
}

export function pillButton(title: string, onClick: (e: MouseEvent) => void, label?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  if (label !== undefined) b.textContent = label;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => { e.preventDefault(); onClick(e); });
  return b;
}

// The designs as a row of icon buttons, the current one pressed.
export function designButtons<V extends string>(designs: readonly BlockDesign<V>[], current: V, pick: (v: V) => void): HTMLElement {
  const group = document.createElement('span');
  group.setAttribute('data-block-designs', '');
  for (const d of designs) {
    const b = pillButton(d.label, () => pick(d.id));
    b.setAttribute('data-block-design', d.id);
    b.setAttribute('aria-pressed', String(d.id === current));
    b.innerHTML = d.icon;
    group.append(b);
  }
  return group;
}

// Design ▸ for the block's right-click menu.
export function designMenuItem<V extends string>(designs: readonly BlockDesign<V>[], current: V, pick: (v: V) => void): ContextMenuItem {
  return {
    id: 'block-design',
    label: LABELS.noteBlocks.design,
    icon: '◫',
    submenu: [designs.map((d) => ({ id: `design-${d.id}`, label: d.label, icon: d.id === current ? '✓' : undefined, run: () => pick(d.id) }))],
  };
}

// A small popover beside `anchor` (a block's arrow, icon slot, …), outside the editor so typing in
// it never reaches the document. Closes on Escape (the suite's Escape stack), a press outside it,
// or `close()`; `build` gets that close. Returns close.
export function openBlockPopover(anchor: DOMRect, build: (close: () => void) => HTMLElement): () => void {
  const el = document.createElement('div');
  el.className = styles.popover;
  let closed = false;
  const onDown = (e: MouseEvent) => { if (!el.contains(e.target as Node)) close(); };
  const unregister = registerEscapeClose(() => close());
  function close() {
    if (closed) return;
    closed = true;
    unregister();
    document.removeEventListener('mousedown', onDown, true);
    el.remove();
  }
  el.append(build(close));
  document.body.append(el);
  const width = el.offsetWidth || 240;
  const height = el.offsetHeight || 120;
  const below = window.innerHeight - anchor.bottom > height + 12 || anchor.top < height + 12;
  el.style.left = `${Math.max(8, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8))}px`;
  el.style.top = `${below ? anchor.bottom + 6 : anchor.top - height - 6}px`;
  setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
  return close;
}

export const popoverClass = styles;
