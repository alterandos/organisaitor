import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { squareIconDataUrl } from '@/utils/imageCompress';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, selectButton, openBlockPopover, pillButton, popoverClass as pop, type BlockDesign } from './blockDesigns';

// A cycle in a note (`\cycle`): stages that lead one to the next and from the last back to the
// first — the water cycle, a habit loop, a product lifecycle. At least two stages.
//
//   cycle        variant (design: ring / flow / steps), numbered, colours (accent / spectrum),
//                iconShape, iconSize
//   cycleName    the cycle's name (the middle of the ring; a title above the other designs)
//   cycleStage   one stage: its label, then a short note. It owns the arrow to the NEXT stage
//                (the last stage's goes back to the first): arrow = forward / both / back, and
//                arrowLabel (the step's name, "Evaporation"). Optional icon (an emoji) or image
//                (a small square picture, utils/imageCompress squareIconDataUrl).
//   cycleLabel / cycleText   the stage's two lines
//
// Keys: Enter goes name → first stage → its note → a new stage; Enter in an empty stage leaves
// the cycle (removing the stage if there are more than two); Tab / Shift+Tab move between stages;
// Backspace at a part's start steps back rather than merging.
// Arrows, icons and the pill are drawn as widgets; clicking an arrow or an icon opens a popover.

export const CYCLE_VARIANTS = ['ring', 'flow', 'steps'] as const;
export type CycleVariant = typeof CYCLE_VARIANTS[number];
export const ARROW_DIRECTIONS = ['forward', 'both', 'back'] as const;
export type ArrowDirection = typeof ARROW_DIRECTIONS[number];
export const ICON_SHAPES = ['circle', 'rounded', 'square'] as const;
export const ICON_SIZES = ['s', 'm', 'l'] as const;
export type IconShape = typeof ICON_SHAPES[number];
export type IconSize = typeof ICON_SIZES[number];
export const MIN_STAGES = 2;
const DEFAULT_STAGES = 3;

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const Cycle = Node.create({
  name: 'cycle',
  group: 'block',
  content: `cycleName cycleStage{${MIN_STAGES},}`,
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant:   { default: 'ring',   parseHTML: (el) => oneOf(CYCLE_VARIANTS, el.getAttribute('data-variant'), 'ring'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      numbered:  { default: false,    parseHTML: (el) => el.getAttribute('data-numbered') === 'true', renderHTML: (a) => ({ 'data-numbered': a.numbered ? 'true' : 'false' }) },
      colours:   { default: 'accent', parseHTML: (el) => oneOf(['accent', 'spectrum'] as const, el.getAttribute('data-colours'), 'accent'), renderHTML: (a) => ({ 'data-colours': a.colours }) },
      iconShape: { default: 'circle', parseHTML: (el) => oneOf(ICON_SHAPES, el.getAttribute('data-icon-shape'), 'circle'), renderHTML: (a) => ({ 'data-icon-shape': a.iconShape }) },
      iconSize:  { default: 'm',      parseHTML: (el) => oneOf(ICON_SIZES, el.getAttribute('data-icon-size'), 'm'), renderHTML: (a) => ({ 'data-icon-size': a.iconSize }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="cycle"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'cycle', 'data-note-block': '' }), 0]; },
});

export const CycleName = Node.create({
  name: 'cycleName',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-cycle-name]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-cycle-name': '' }), 0]; },
});

export const CycleStage = Node.create({
  name: 'cycleStage',
  content: 'cycleLabel cycleText',
  defining: true,

  addAttributes() {
    return {
      arrow:      { default: 'forward', parseHTML: (el) => oneOf(ARROW_DIRECTIONS, el.getAttribute('data-arrow'), 'forward'), renderHTML: (a) => ({ 'data-arrow': a.arrow }) },
      arrowLabel: { default: '',   parseHTML: (el) => el.getAttribute('data-arrow-label') ?? '', renderHTML: (a) => (a.arrowLabel ? { 'data-arrow-label': a.arrowLabel } : {}) },
      icon:       { default: null, parseHTML: (el) => el.getAttribute('data-icon'), renderHTML: (a) => (a.icon ? { 'data-icon': a.icon } : {}) },
      image:      { default: null, parseHTML: (el) => el.getAttribute('data-image'), renderHTML: (a) => (a.image ? { 'data-image': a.image } : {}) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="cycle-stage"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'cycle-stage' }), 0]; },
});

export const CycleLabel = Node.create({
  name: 'cycleLabel',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-cycle-label]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-cycle-label': '' }), 0]; },
});

export const CycleText = Node.create({
  name: 'cycleText',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-cycle-text]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-cycle-text': '' }), 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface CycleAt {
  cycle:  PMNode;
  pos:    number;           // the cycle's position
  part:   'name' | 'label' | 'text';
  stage:  number;           // index of the stage the position is in (-1 in the name)
}

function cycleAt($pos: ResolvedPos): CycleAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'cycle') continue;
    const cycle = $pos.node(d);
    const pos = $pos.before(d);
    const child = d < $pos.depth ? $pos.index(d) : 0;
    if (child === 0) return { cycle, pos, part: 'name', stage: -1 };
    const inStage = d + 1 < $pos.depth ? $pos.index(d + 1) : 0;
    return { cycle, pos, part: inStage === 0 ? 'label' : 'text', stage: child - 1 };
  }
  return null;
}

// Position of the cycle's child `index` (0 = the name, 1… = stages).
function childPos(cycle: PMNode, pos: number, index: number): number {
  let p = pos + 1;
  for (let i = 0; i < index; i++) p += cycle.child(i).nodeSize;
  return p;
}

const stageCount = (cycle: PMNode) => cycle.childCount - 1;
const stagePos = (cycle: PMNode, pos: number, stage: number) => childPos(cycle, pos, stage + 1);
const isEmptyStage = (stage: PMNode) => stage.textContent.trim() === '';

// Inside a stage's label (or its text), at the end.
const labelEnd = (cycle: PMNode, pos: number, stage: number) => {
  const sp = stagePos(cycle, pos, stage);
  return sp + 2 + cycle.child(stage + 1).child(0).content.size;
};
const textEnd = (cycle: PMNode, pos: number, stage: number) => {
  const s = cycle.child(stage + 1);
  return stagePos(cycle, pos, stage) + 1 + s.child(0).nodeSize + 1 + s.child(1).content.size;
};

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

const newStage = (state: EditorState, label = '') => state.schema.nodes.cycleStage.create(null, [
  state.schema.nodes.cycleLabel.create(null, label ? state.schema.text(label) : null),
  state.schema.nodes.cycleText.create(),
]);

// `\cycle`: replaces from..to (what was typed and the space before it) with a cycle of three
// empty stages, the cursor in its name.
export function insertCycle(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.cycle;
  if (!type) return null;
  const $start = state.doc.resolve(from);
  while (from > $start.start() && /\s/.test(state.doc.textBetween(from - 1, from))) from--;
  const node = type.create(null, [state.schema.nodes.cycleName.create(), ...Array.from({ length: DEFAULT_STAGES }, () => newStage(state))]);
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
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

export type CycleSettings = Partial<{ variant: CycleVariant; numbered: boolean; colours: 'accent' | 'spectrum'; iconShape: IconShape; iconSize: IconSize }>;

export function setCycleSettings(view: EditorView, pos: number, attrs: CycleSettings): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'cycle') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

export function setStageAttrs(view: EditorView, pos: number, attrs: Partial<{ arrow: ArrowDirection; arrowLabel: string; icon: string | null; image: string | null }>): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'cycleStage') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

// Every arrow turned round (both-way ones stay both ways).
export function reverseCycle(view: EditorView, pos: number): void {
  const cycle = view.state.doc.nodeAt(pos);
  if (cycle?.type.name !== 'cycle') return;
  const tr = view.state.tr;
  cycle.forEach((child, offset, i) => {
    if (i === 0 || child.attrs.arrow === 'both') return;
    tr.setNodeMarkup(pos + 1 + offset, undefined, { ...child.attrs, arrow: child.attrs.arrow === 'forward' ? 'back' : 'forward' });
  });
  view.dispatch(tr);
}

// A new stage after stage `after` (default: at the end), the cursor in its label.
export function addStage(view: EditorView, pos: number, after?: number): void {
  const cycle = view.state.doc.nodeAt(pos);
  if (cycle?.type.name !== 'cycle') return;
  const index = after ?? stageCount(cycle) - 1;
  const at = stagePos(cycle, pos, index) + cycle.child(index + 1).nodeSize;
  const tr = view.state.tr.insert(at, newStage(view.state));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

// Deletes the stage at `pos`, while more than two would remain; the cursor goes to the end of the
// stage before it (or the start of the next).
export function deleteStage(view: EditorView, pos: number): boolean {
  const $s = view.state.doc.resolve(pos);
  const cycle = $s.parent;
  const stage = view.state.doc.nodeAt(pos);
  if (cycle.type.name !== 'cycle' || stage?.type.name !== 'cycleStage' || stageCount(cycle) <= MIN_STAGES) return false;
  const tr = view.state.tr.delete(pos, pos + stage.nodeSize);
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(pos), -1)).scrollIntoView());
  view.focus();
  return true;
}

export const canDeleteStage = (state: EditorState, pos: number) => {
  const cycle = state.doc.resolve(pos).parent;
  return cycle.type.name === 'cycle' && stageCount(cycle) > MIN_STAGES;
};

export function cyclePosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="cycle"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'cycle' ? pos : null;
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

function caretTo(state: EditorState, pos: number, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  return true;
}

// Leaves the cycle from an empty stage: the stage goes if there'd still be enough, and an empty
// line follows the cycle.
function leaveCycle(state: EditorState, c: CycleAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const tr = state.tr;
  let end = c.pos + c.cycle.nodeSize;
  if (stageCount(c.cycle) > MIN_STAGES) {
    const sp = stagePos(c.cycle, c.pos, c.stage);
    const size = c.cycle.child(c.stage + 1).nodeSize;
    tr.delete(sp, sp + size);
    end -= size;
  }
  tr.insert(end, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  return true;
}

export const cycleEnter: Command = (state, dispatch) => {
  const c = cycleAt(state.selection.$from);
  if (!c) return false;
  if (c.part === 'name') return caretTo(state, labelEnd(c.cycle, c.pos, 0), dispatch);
  const stage = c.cycle.child(c.stage + 1);
  if (isEmptyStage(stage)) return leaveCycle(state, c, dispatch);
  if (c.part === 'label') return caretTo(state, textEnd(c.cycle, c.pos, c.stage), dispatch);
  // From a note: on to the next stage if it's still empty (the ones a new cycle starts with), else
  // a new stage here.
  if (c.stage + 1 < stageCount(c.cycle) && isEmptyStage(c.cycle.child(c.stage + 2))) {
    return caretTo(state, labelEnd(c.cycle, c.pos, c.stage + 1), dispatch);
  }
  if (dispatch) {
    const at = stagePos(c.cycle, c.pos, c.stage) + stage.nodeSize;
    const tr = state.tr.insert(at, newStage(state));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  }
  return true;
};

export const cycleTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const c = cycleAt(state.selection.$from);
  if (!c) return false;
  const next = c.stage + dir;
  if (next < 0) return caretTo(state, c.pos + 2 + c.cycle.child(0).content.size, dispatch);
  if (next >= stageCount(c.cycle)) return true;
  return caretTo(state, labelEnd(c.cycle, c.pos, next), dispatch);
};

export const cycleBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const c = cycleAt($from);
  if (!c) return false;
  if (c.part === 'name') {
    if (c.cycle.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(c.pos, c.pos + c.cycle.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, c.pos + 1)));
    }
    return true;
  }
  if (c.part === 'text') return caretTo(state, labelEnd(c.cycle, c.pos, c.stage), dispatch);
  const stage = c.cycle.child(c.stage + 1);
  const prevEnd = c.stage === 0 ? c.pos + 2 + c.cycle.child(0).content.size : textEnd(c.cycle, c.pos, c.stage - 1);
  if (isEmptyStage(stage) && stageCount(c.cycle) > MIN_STAGES) {
    if (dispatch) {
      const sp = stagePos(c.cycle, c.pos, c.stage);
      const tr = state.tr.delete(sp, sp + stage.nodeSize);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, prevEnd)).scrollIntoView());
    }
    return true;
  }
  return caretTo(state, prevEnd, dispatch);
};

export const cycleDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!cycleAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

// Ring geometry, in the ring's own 0–100 units (it's square): stage i sits at `angle(i)` on a
// circle of radius R; the arrow from i to i+1 is the arc between them, short of both cards.
const R = 38;
const CARD_HALF = 14;
const angle = (i: number, n: number) => -90 + (i * 360) / n;
const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (deg: number, r = R) => [50 + r * Math.cos(rad(deg)), 50 + r * Math.sin(rad(deg))] as const;

export function ringPlacement(i: number, n: number): { x: number; y: number } {
  const [x, y] = pt(angle(i, n));
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (name: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

// An arrowhead with its tip at (x, y), pointing along (dx, dy).
function head(x: number, y: number, dx: number, dy: number, size: number): string {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x - ux * size;
  const by = y - uy * size;
  const w = size * 0.6;
  return `M${x},${y} L${bx - uy * w},${by + ux * w} L${bx + uy * w},${by - ux * w} Z`;
}

interface ArrowInfo {
  index:     number;       // the stage it leaves
  n:         number;
  variant:   CycleVariant;
  direction: ArrowDirection;
  label:     string;
  returns:   boolean;      // the last stage's: back to the first
}

// Where the arc from stage i to the next starts and ends (angles, degrees): just outside each
// card, given its half-width and half-height in ring units (the ring is 100 units across). Walks
// out from each card's centre along the circle until the point leaves the card (plus `margin`).
export interface CardBox { hw: number; hh: number }
const DEFAULT_CARD: CardBox = { hw: CARD_HALF, hh: 9 };

export function ringArcEnds(i: number, n: number, from: CardBox = DEFAULT_CARD, to: CardBox = DEFAULT_CARD, margin = 1.5): [number, number] {
  const sep = 360 / n;
  const out = (centre: number, box: CardBox, dir: 1 | -1) => {
    const [cx, cy] = pt(centre);
    for (let d = 0; d <= sep / 2; d += 0.25) {
      const [x, y] = pt(centre + dir * d);
      if (Math.abs(x - cx) > box.hw + margin || Math.abs(y - cy) > box.hh + margin) return d;
    }
    return sep / 2;
  };
  const a0 = angle(i, n);
  return [a0 + out(a0, from, 1), a0 + sep - out(a0 + sep, to, -1)];
}

// Sets an arc's line, heads and label for the angles a0 → a1 (hidden if the cards leave no room).
function placeRingArc(svg: SVGSVGElement, a0: number, a1: number): void {
  const direction = svg.getAttribute('data-direction') as ArrowDirection;
  const room = a1 - a0 > 2;
  svg.toggleAttribute('data-no-room', !room);
  const [x0, y0] = pt(a0);
  const [x1, y1] = pt(a1);
  const d = room ? `M${x0},${y0} A${R},${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}` : '';
  svg.querySelector('[data-line]')?.setAttribute('d', d);
  svg.querySelector('[data-hit]')?.setAttribute('d', d);
  const heads: string[] = [];
  if (room && direction !== 'back') heads.push(head(x1, y1, -Math.sin(rad(a1)), Math.cos(rad(a1)), 3.2));
  if (room && direction !== 'forward') heads.push(head(x0, y0, Math.sin(rad(a0)), -Math.cos(rad(a0)), 3.2));
  svg.querySelector('[data-head]')?.setAttribute('d', heads.join(' '));
  const text = svg.querySelector('[data-label]');
  if (text) {
    const mid = (a0 + a1) / 2;
    const [lx, ly] = pt(mid, R + 7);
    text.setAttribute('x', String(lx));
    text.setAttribute('y', String(ly));
    text.setAttribute('text-anchor', Math.abs(Math.cos(rad(mid))) < 0.3 ? 'middle' : Math.cos(rad(mid)) > 0 ? 'start' : 'end');
  }
}

function ringArrow(a: ArrowInfo): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 100 100', 'data-cycle-ring-arrow': '', 'data-index': a.index, 'data-direction': a.direction }) as SVGSVGElement;
  svg.append(svgEl('path', { 'data-line': '' }), svgEl('path', { 'data-hit': '' }), svgEl('path', { 'data-head': '' }));
  if (a.label) {
    const text = svgEl('text', { 'data-label': '', 'dominant-baseline': 'middle' });
    text.textContent = a.label;
    svg.append(text);
  }
  const [a0, a1] = ringArcEnds(a.index, a.n);
  placeRingArc(svg, a0, a1);
  return svg;
}

// After each render (and on resize): fits every ring's arcs to its cards' real sizes, so an arrow
// always ends at the card it points at, whatever the card holds (an icon or not, a long note…).
class RingLayout {
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
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.layout(); });
  }

  private layout() {
    if (this.view.isDestroyed) return;
    for (const ring of this.view.dom.querySelectorAll<HTMLElement>('[data-type="cycle"][data-variant="ring"]')) {
      const width = ring.getBoundingClientRect().width;
      if (!width) continue;
      const scale = 100 / width;
      const boxes: CardBox[] = [...ring.children]
        .filter((el) => el.matches('[data-type="cycle-stage"]'))
        .map((el) => { const r = el.getBoundingClientRect(); return { hw: (r.width / 2) * scale, hh: (r.height / 2) * scale }; });
      const n = boxes.length;
      for (const svg of ring.querySelectorAll<SVGSVGElement>(':scope > [data-cycle-ring-arrow]')) {
        const i = Number(svg.getAttribute('data-index'));
        if (!(i < n)) continue;
        const [a0, a1] = ringArcEnds(i, n, boxes[i], boxes[(i + 1) % n]);
        placeRingArc(svg, a0, a1);
      }
    }
  }
}

// A straight arrow between two stages (flow: across; steps: down), or the return loop.
function lineArrow(a: ArrowInfo): HTMLElement {
  const box = document.createElement('div');
  box.setAttribute('data-cycle-line-arrow', a.returns ? 'return' : 'next');
  box.setAttribute('data-direction', a.direction);
  const line = document.createElement('span');
  line.setAttribute('data-line', '');
  box.append(line);
  for (const end of ['start', 'end'] as const) {
    const show = end === 'end' ? a.direction !== 'back' : a.direction !== 'forward';
    if (!show) continue;
    const h = document.createElement('span');
    h.setAttribute('data-head', end);
    box.append(h);
  }
  if (a.label) {
    const label = document.createElement('span');
    label.setAttribute('data-label', '');
    label.textContent = a.label;
    box.append(label);
  }
  return box;
}

function arrowWidget(view: EditorView, getPos: () => number | undefined, a: ArrowInfo): Element {
  const el = a.variant === 'ring' ? ringArrow(a) : lineArrow(a);
  el.setAttribute('data-cycle-arrow', '');
  const target = a.variant === 'ring' ? el.querySelector('[data-hit]') ?? el : el;
  const title = document.createElementNS(SVG, 'title');
  title.textContent = LABELS.noteBlocks.cycle.arrowEdit;
  if (a.variant === 'ring') el.prepend(title); else el.setAttribute('title', LABELS.noteBlocks.cycle.arrowEdit);
  const open = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const end = getPos();
    if (end === undefined || !view.editable) return;
    // The widget sits just after the stage whose arrow it is.
    const $end = view.state.doc.resolve(end);
    const stage = $end.nodeBefore;
    if (stage?.type.name !== 'cycleStage') return;
    openArrowEditor(view, end - stage.nodeSize, (e.target as Element).getBoundingClientRect());
  };
  target.addEventListener('mousedown', (e) => e.preventDefault());
  target.addEventListener('click', open);
  el.querySelector('[data-label]')?.addEventListener('click', open);
  return el;
}

function openArrowEditor(view: EditorView, stagePosAt: number, anchor: DOMRect): void {
  const stage = view.state.doc.nodeAt(stagePosAt);
  if (!stage) return;
  const L = LABELS.noteBlocks.cycle;
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    const h1 = document.createElement('div');
    h1.className = pop.heading;
    h1.textContent = L.arrowTitle;
    const row = document.createElement('div');
    row.className = pop.row;
    for (const d of ARROW_DIRECTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = pop.choice;
      b.textContent = L.arrowDirections[d];
      b.setAttribute('aria-pressed', String(stage.attrs.arrow === d));
      b.addEventListener('click', () => { setStageAttrs(view, stagePosAt, { arrow: d }); close(); view.focus(); });
      row.append(b);
    }
    const h2 = document.createElement('div');
    h2.className = pop.heading;
    h2.textContent = L.arrowLabel;
    const input = document.createElement('input');
    input.className = pop.input;
    input.value = stage.attrs.arrowLabel ?? '';
    input.placeholder = L.arrowPlaceholder;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      setStageAttrs(view, stagePosAt, { arrowLabel: input.value.trim() });
      close();
      view.focus();
    });
    const hint = document.createElement('div');
    hint.className = pop.hint;
    hint.textContent = L.saveHint;
    box.append(h1, row, h2, input, hint);
    setTimeout(() => input.focus(), 0);
    return box;
  });
}

const ICON_CHOICES = ['☀️', '💧', '☁️', '🌧️', '❄️', '🌊', '🌱', '🌳', '🍂', '🔥', '⚡', '🌍', '♻️', '🔄', '⚙️', '🏭', '📦', '🚚', '🛒', '💰', '📈', '📉', '💡', '🧠', '✍️', '🔍', '🧪', '✅', '🎯', '❤️', '😴', '🏃'];

async function setStageImage(view: EditorView, pos: number, file: File | undefined | null): Promise<void> {
  if (!file || !file.type.startsWith('image/')) return;
  const image = await squareIconDataUrl(file);
  setStageAttrs(view, pos, { image, icon: null });
}

function openIconPicker(view: EditorView, cyclePos: number, stagePosAt: number, anchor: DOMRect): void {
  const cycle = view.state.doc.nodeAt(cyclePos);
  const stage = view.state.doc.nodeAt(stagePosAt);
  if (!cycle || !stage) return;
  const L = LABELS.noteBlocks.cycle;
  openBlockPopover(anchor, (close) => {
    const done = () => { close(); view.focus(); };
    const box = document.createElement('div');
    const heading = (text: string) => { const h = document.createElement('div'); h.className = pop.heading; h.textContent = text; return h; };
    const grid = document.createElement('div');
    grid.className = pop.emojiGrid;
    for (const emoji of ICON_CHOICES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = pop.emoji;
      b.textContent = emoji;
      b.addEventListener('click', () => { setStageAttrs(view, stagePosAt, { icon: emoji, image: null }); done(); });
      grid.append(b);
    }
    const input = document.createElement('input');
    input.className = pop.input;
    input.placeholder = L.iconPaste;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = [...new Intl.Segmenter().segment(input.value.trim())][0]?.segment;
      if (first) setStageAttrs(view, stagePosAt, { icon: first, image: null });
      done();
    });
    const actions = document.createElement('div');
    actions.className = pop.row;
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    file.addEventListener('change', () => { void setStageImage(view, stagePosAt, file.files?.[0]).then(done); });
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = pop.link;
    choose.textContent = `${L.iconChoose} ${L.iconDrop}`;
    choose.addEventListener('click', () => file.click());
    actions.append(choose, file);
    if (stage.attrs.icon || stage.attrs.image) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = `${pop.link} ${pop.danger}`;
      remove.textContent = L.iconRemove;
      remove.addEventListener('click', () => { setStageAttrs(view, stagePosAt, { icon: null, image: null }); done(); });
      actions.append(remove);
    }
    const choiceRow = <T extends string>(values: readonly T[], labels: Record<T, string>, current: T, set: (v: T) => void) => {
      const row = document.createElement('div');
      row.className = pop.row;
      for (const v of values) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = pop.choice;
        b.textContent = labels[v];
        b.setAttribute('aria-pressed', String(v === current));
        b.addEventListener('click', () => { set(v); done(); });
        row.append(b);
      }
      return row;
    };
    box.append(
      heading(L.iconTitle), grid, input, actions,
      heading(L.iconShape), choiceRow(ICON_SHAPES, L.shapes, cycle.attrs.iconShape, (v) => setCycleSettings(view, cyclePos, { iconShape: v })),
      heading(L.iconSize), choiceRow(ICON_SIZES, L.sizes, cycle.attrs.iconSize, (v) => setCycleSettings(view, cyclePos, { iconSize: v })),
    );
    return box;
  });
}

function iconWidget(view: EditorView, getPos: () => number | undefined, icon: string | null, image: string | null): HTMLElement {
  const slot = document.createElement('div');
  slot.contentEditable = 'false';
  slot.setAttribute('data-cycle-icon', icon || image ? 'set' : 'empty');
  slot.title = LABELS.noteBlocks.cycle.iconAdd;
  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    img.draggable = false;
    slot.append(img);
  } else if (icon) {
    slot.textContent = icon;
  } else {
    slot.textContent = '+';
  }
  // The widget sits at the start of the stage's content: the stage is just before it.
  const stageAt = () => { const p = getPos(); return p === undefined ? null : p - 1; };
  slot.addEventListener('mousedown', (e) => e.preventDefault());
  slot.addEventListener('click', (e) => {
    e.preventDefault();
    const sp = stageAt();
    if (sp === null || !view.editable) return;
    const $s = view.state.doc.resolve(sp);
    openIconPicker(view, $s.before($s.depth), sp, slot.getBoundingClientRect());
  });
  slot.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); slot.setAttribute('data-drop', ''); } });
  slot.addEventListener('dragleave', () => slot.removeAttribute('data-drop'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.removeAttribute('data-drop');
    const sp = stageAt();
    if (sp !== null && view.editable) void setStageImage(view, sp, e.dataTransfer?.files?.[0]);
  });
  return slot;
}

// The × in a stage's corner (only while the cycle has more than two stages).
function deleteWidget(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-cycle-delete', '');
  b.title = LABELS.noteBlocks.cycle.deleteStage;
  b.setAttribute('aria-label', LABELS.noteBlocks.cycle.deleteStage);
  b.textContent = '×';
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p === undefined || !view.editable) return;
    deleteStage(view, view.state.doc.resolve(p).before());
  });
  return b;
}

const DESIGN_ICONS: Record<CycleVariant, string> = {
  ring:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2a5.8 5.8 0 0 1 5.6 4.3M13.4 9.8A5.8 5.8 0 0 1 3 11.6M2.3 7A5.8 5.8 0 0 1 5.6 2.7"/><circle cx="8" cy="2.2" r="1.4"/><circle cx="13.6" cy="8.4" r="1.4"/><circle cx="3" cy="11.6" r="1.4"/></svg>',
  flow:  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="3.5" width="3.6" height="3.6" rx="1"/><rect x="6.2" y="3.5" width="3.6" height="3.6" rx="1"/><rect x="11.4" y="3.5" width="3.6" height="3.6" rx="1"/><path d="M13.2 8.5v2.8H2.8V8.5"/></svg>',
  steps: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h8M6 8h8M6 13h6"/><path d="M3.2 13H1.8V3h1.4"/><circle cx="3.6" cy="3" r="1.2"/><circle cx="3.6" cy="8" r="1.2"/><circle cx="3.6" cy="13" r="1.2"/></svg>',
};

export const CYCLE_DESIGNS: BlockDesign<CycleVariant>[] = CYCLE_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.cycle.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.cycle;
  const bar = blockPill('data-cycle-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const set = (a: CycleSettings) => { const p = pos(); if (p !== null) setCycleSettings(view, p, a); };
  const numbered = attrs.numbered === true;
  const spectrum = attrs.colours === 'spectrum';
  const num = pillButton(numbered ? L.unnumbered : L.numbered, () => set({ numbered: !numbered }), '1 2 3');
  num.setAttribute('data-cy-tool', 'numbered');
  num.setAttribute('aria-pressed', String(numbered));
  const colours = pillButton(L.colourTitle(spectrum ? L.colours.spectrum : L.colours.accent), () => set({ colours: spectrum ? 'accent' : 'spectrum' }));
  colours.setAttribute('data-cy-tool', 'colours');
  colours.setAttribute('aria-pressed', String(spectrum));
  const reverse = pillButton(L.reverse, () => { const p = pos(); if (p !== null) reverseCycle(view, p); }, '⇄');
  reverse.setAttribute('data-cy-tool', 'reverse');
  const add = pillButton(L.addStage, () => { const p = pos(); if (p !== null) addStage(view, p); }, `+ ${L.addStage}`);
  add.setAttribute('data-cy-tool', 'add');
  bar.append(designButtons(CYCLE_DESIGNS, attrs.variant as CycleVariant, (v) => set({ variant: v })), num, colours, reverse, add, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

// Per cycle: the pill, and its size and design as CSS variables. Per stage: its place on the ring
// and its colour, its icon slot, its arrow (after it), and the placeholders. An empty note shows
// only while the cycle is being edited.
function cycleDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.cycle;
  const current = cycleAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'cycle') return !node.isTextblock;
    const k = t++;
    const n = stageCount(node);
    const variant = node.attrs.variant as CycleVariant;
    const editing = current?.pos === pos;
    const spectrum = node.attrs.colours === 'spectrum';
    decos.push(Decoration.node(pos, pos + node.nodeSize, {
      style: `--cycle-n: ${n}; --cycle-cols: ${2 * n - 1}`,
      ...(editing ? { 'data-cycle-current': '' } : {}),
    }));
    const attrsKey = `${variant}-${node.attrs.numbered}-${node.attrs.colours}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node.attrs),
      { side: -1, key: `cycle-tools-${k}-${attrsKey}`, ignoreSelection: true, stopEvent: () => true }));
    const name = node.child(0);
    if (name.content.size === 0) {
      decos.push(Decoration.node(pos + 1, pos + 1 + name.nodeSize, { 'data-cy-empty': '', 'data-cy-placeholder': L.centerPlaceholder, ...(editing ? {} : { 'data-cy-hide': '' }) }));
    }
    node.forEach((stage, offset, ci) => {
      if (ci === 0) return;
      const i = ci - 1;
      const sp = pos + 1 + offset;
      const style: string[] = [`--i: ${i}`];
      if (variant === 'ring') { const { x, y } = ringPlacement(i, n); style.push(`--x: ${x}%`, `--y: ${y}%`); }
      if (spectrum) style.push(`--stage-color: hsl(${Math.round((210 + (i * 360) / n) % 360)} 62% 52%)`);
      decos.push(Decoration.node(sp, sp + stage.nodeSize, { style: style.join('; ') }));
      decos.push(Decoration.widget(sp + 1, (view, getPos) => iconWidget(view, getPos, stage.attrs.icon, stage.attrs.image),
        { side: -1, key: `cycle-icon-${k}-${i}-${stage.attrs.icon ?? ''}-${(stage.attrs.image ?? '').length}`, ignoreSelection: true, stopEvent: () => true }));
      if (n > MIN_STAGES) {
        decos.push(Decoration.widget(sp + stage.nodeSize - 1, (view, getPos) => deleteWidget(view, getPos),
          { side: 1, key: `cycle-delete-${k}-${i}`, ignoreSelection: true, stopEvent: () => true }));
      }
      const arrow: ArrowInfo = { index: i, n, variant, direction: stage.attrs.arrow, label: stage.attrs.arrowLabel, returns: i === n - 1 };
      decos.push(Decoration.widget(sp + stage.nodeSize, (view, getPos) => arrowWidget(view, getPos, arrow),
        { side: 1, key: `cycle-arrow-${k}-${i}-${n}-${variant}-${arrow.direction}-${arrow.label}`, ignoreSelection: true, stopEvent: () => true }));
      const label = stage.child(0);
      const text = stage.child(1);
      const labelPos = sp + 1;
      const textPos = labelPos + label.nodeSize;
      if (label.content.size === 0) decos.push(Decoration.node(labelPos, textPos, { 'data-cy-empty': '', 'data-cy-placeholder': L.labelPlaceholder }));
      if (text.content.size === 0) {
        decos.push(Decoration.node(textPos, textPos + text.nodeSize, editing
          ? { 'data-cy-empty': '', 'data-cy-placeholder': L.textPlaceholder }
          : { 'data-cy-hide': '' }));
      }
    });
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const cycleKey = new PluginKey('cycle');

// Keys and drawing, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const CycleBehaviour = Extension.create({
  name: 'cycleBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(cycleEnter),
      Tab: run(cycleTab(1)),
      'Shift-Tab': run(cycleTab(-1)),
      Backspace: run(cycleBackspace),
      Delete: run(cycleDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: cycleKey, props: { decorations: cycleDecorations }, view: (view) => new RingLayout(view) })];
  },
});

export const CycleExtensions = [Cycle, CycleName, CycleStage, CycleLabel, CycleText, CycleBehaviour];
