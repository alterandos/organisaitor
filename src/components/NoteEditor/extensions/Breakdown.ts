import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, selectButton, type BlockDesign } from './blockDesigns';

// A breakdown in a note (`\breakdown`): a whole and the parts it's made of — the pillars of
// democracy, the elements of a strategy, what makes a good habit. At least two parts.
//
//   breakdown        variant (design: hub / pillars / tree), colours (accent / spectrum), frames
//   breakdownWhole   the whole (the hub's centre, the temple's roof, the tree's top)
//   breakdownPart    one part: its label, then a short note
//   breakdownLabel / breakdownText   the part's two lines
//
// Keys, as the cycle's: Enter goes whole → first part → its note → the next part (an empty one if
// it's waiting, else a new one); Enter in an empty part leaves the breakdown (removing the part if
// more than two would remain); Tab / Shift+Tab between parts; Backspace steps back.

export const BREAKDOWN_VARIANTS = ['hub', 'pillars', 'tree'] as const;
export type BreakdownVariant = typeof BREAKDOWN_VARIANTS[number];
export const MIN_PARTS = 2;
const DEFAULT_PARTS = 3;

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const Breakdown = Node.create({
  name: 'breakdown',
  group: 'block',
  content: `breakdownWhole breakdownPart{${MIN_PARTS},}`,
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'hub', parseHTML: (el) => oneOf(BREAKDOWN_VARIANTS, el.getAttribute('data-variant'), 'hub'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      colours: { default: 'accent', parseHTML: (el) => oneOf(['accent', 'spectrum'] as const, el.getAttribute('data-colours'), 'accent'), renderHTML: (a) => ({ 'data-colours': a.colours }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="breakdown"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'breakdown', 'data-note-block': '' }), 0]; },
});

export const BreakdownWhole = Node.create({
  name: 'breakdownWhole',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-bd-whole]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-bd-whole': '' }), 0]; },
});

export const BreakdownPart = Node.create({
  name: 'breakdownPart',
  content: 'breakdownLabel breakdownText',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-type="breakdown-part"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'breakdown-part' }), 0]; },
});

export const BreakdownLabel = Node.create({
  name: 'breakdownLabel',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-bd-label]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-bd-label': '' }), 0]; },
});

export const BreakdownText = Node.create({
  name: 'breakdownText',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-bd-text]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-bd-text': '' }), 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface BreakdownAt {
  node: PMNode;
  pos:  number;
  part: 'whole' | 'label' | 'text';
  index: number;          // which part (-1 in the whole)
}

function breakdownAt($pos: ResolvedPos): BreakdownAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'breakdown') continue;
    const child = d < $pos.depth ? $pos.index(d) : 0;
    if (child === 0) return { node: $pos.node(d), pos: $pos.before(d), part: 'whole', index: -1 };
    const inPart = d + 1 < $pos.depth ? $pos.index(d + 1) : 0;
    return { node: $pos.node(d), pos: $pos.before(d), part: inPart === 0 ? 'label' : 'text', index: child - 1 };
  }
  return null;
}

const partCount = (node: PMNode) => node.childCount - 1;
function partPos(node: PMNode, pos: number, index: number): number {
  let p = pos + 1;
  for (let i = 0; i < index + 1; i++) p += node.child(i).nodeSize;
  return p;
}
const isEmptyPart = (part: PMNode) => part.textContent.trim() === '';
const wholeEnd = (node: PMNode, pos: number) => pos + 2 + node.child(0).content.size;
const labelEnd = (node: PMNode, pos: number, index: number) => partPos(node, pos, index) + 2 + node.child(index + 1).child(0).content.size;
const textEnd = (node: PMNode, pos: number, index: number) => {
  const part = node.child(index + 1);
  return partPos(node, pos, index) + 1 + part.child(0).nodeSize + 1 + part.child(1).content.size;
};

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

const newPart = (state: EditorState) => state.schema.nodes.breakdownPart.create(null, [
  state.schema.nodes.breakdownLabel.create(),
  state.schema.nodes.breakdownText.create(),
]);

// `\breakdown`: replaces from..to (what was typed and the space before it) with a breakdown of
// three empty parts, the cursor in the whole.
export function insertBreakdown(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.breakdown;
  if (!type) return null;
  const $start = state.doc.resolve(from);
  while (from > $start.start() && /\s/.test(state.doc.textBetween(from - 1, from))) from--;
  const node = type.create(null, [state.schema.nodes.breakdownWhole.create(), ...Array.from({ length: DEFAULT_PARTS }, () => newPart(state))]);
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

export type BreakdownSettings = Partial<{ variant: BreakdownVariant; colours: 'accent' | 'spectrum' }>;

export function setBreakdownSettings(view: EditorView, pos: number, attrs: BreakdownSettings): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'breakdown') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

export function addPart(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'breakdown') return;
  const at = pos + node.nodeSize - 1;
  const tr = view.state.tr.insert(at, newPart(view.state));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

export const canDeletePart = (state: EditorState, pos: number) => {
  const parent = state.doc.resolve(pos).parent;
  return parent.type.name === 'breakdown' && partCount(parent) > MIN_PARTS;
};

export function deletePart(view: EditorView, pos: number): boolean {
  const part = view.state.doc.nodeAt(pos);
  if (part?.type.name !== 'breakdownPart' || !canDeletePart(view.state, pos)) return false;
  const tr = view.state.tr.delete(pos, pos + part.nodeSize);
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(pos), -1)).scrollIntoView());
  view.focus();
  return true;
}

export function breakdownPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="breakdown"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'breakdown' ? pos : null;
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

function caretTo(state: EditorState, pos: number, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  return true;
}

function leave(state: EditorState, b: BreakdownAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const tr = state.tr;
  let end = b.pos + b.node.nodeSize;
  if (partCount(b.node) > MIN_PARTS) {
    const pp = partPos(b.node, b.pos, b.index);
    const size = b.node.child(b.index + 1).nodeSize;
    tr.delete(pp, pp + size);
    end -= size;
  }
  tr.insert(end, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  return true;
}

export const breakdownEnter: Command = (state, dispatch) => {
  const b = breakdownAt(state.selection.$from);
  if (!b) return false;
  if (b.part === 'whole') return caretTo(state, labelEnd(b.node, b.pos, 0), dispatch);
  const part = b.node.child(b.index + 1);
  if (isEmptyPart(part)) return leave(state, b, dispatch);
  if (b.part === 'label') return caretTo(state, textEnd(b.node, b.pos, b.index), dispatch);
  if (b.index + 1 < partCount(b.node) && isEmptyPart(b.node.child(b.index + 2))) return caretTo(state, labelEnd(b.node, b.pos, b.index + 1), dispatch);
  if (dispatch) {
    const at = partPos(b.node, b.pos, b.index) + part.nodeSize;
    const tr = state.tr.insert(at, newPart(state));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  }
  return true;
};

export const breakdownTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const b = breakdownAt(state.selection.$from);
  if (!b) return false;
  const next = b.index + dir;
  if (next < 0) return caretTo(state, wholeEnd(b.node, b.pos), dispatch);
  if (next >= partCount(b.node)) return true;
  return caretTo(state, labelEnd(b.node, b.pos, next), dispatch);
};

export const breakdownBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const b = breakdownAt($from);
  if (!b) return false;
  if (b.part === 'whole') {
    if (b.node.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(b.pos, b.pos + b.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, b.pos + 1)));
    }
    return true;
  }
  if (b.part === 'text') return caretTo(state, labelEnd(b.node, b.pos, b.index), dispatch);
  const part = b.node.child(b.index + 1);
  const prevEnd = b.index === 0 ? wholeEnd(b.node, b.pos) : textEnd(b.node, b.pos, b.index - 1);
  if (isEmptyPart(part) && partCount(b.node) > MIN_PARTS) {
    if (dispatch) {
      const pp = partPos(b.node, b.pos, b.index);
      const tr = state.tr.delete(pp, pp + part.nodeSize);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, prevEnd)).scrollIntoView());
    }
    return true;
  }
  return caretTo(state, prevEnd, dispatch);
};

export const breakdownDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!breakdownAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

// Hub geometry, in the hub's own 0–100 units (it's square): part i at angle(i) on radius R.
const R = 37;
const angle = (i: number, n: number) => -90 + (i * 360) / n;
export function hubPlacement(i: number, n: number): { x: number; y: number } {
  const a = (angle(i, n) * Math.PI) / 180;
  return { x: Math.round((50 + R * Math.cos(a)) * 10) / 10, y: Math.round((50 + R * Math.sin(a)) * 10) / 10 };
}

const SVG = 'http://www.w3.org/2000/svg';

// The hub's spokes: from the centre to each part, under the cards and the centre (which hide
// their ends), so they always meet both whatever their sizes.
function spokesWidget(n: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('data-bd-spokes', '');
  svg.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) {
    const { x, y } = hubPlacement(i, n);
    const line = document.createElementNS(SVG, 'line');
    line.setAttribute('x1', '50');
    line.setAttribute('y1', '50');
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('style', `--i: ${i}`);
    svg.append(line);
  }
  return svg;
}

function deleteWidget(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-bd-delete', '');
  b.title = LABELS.noteBlocks.breakdown.deletePart;
  b.setAttribute('aria-label', LABELS.noteBlocks.breakdown.deletePart);
  b.textContent = '×';
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p !== undefined && view.editable) deletePart(view, view.state.doc.resolve(p).before());
  });
  return b;
}

const DESIGN_ICONS: Record<BreakdownVariant, string> = {
  hub:     '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.4"/><path d="M8 5.6V2.8M10.2 9.2l2.5 1.5M5.8 9.2l-2.5 1.5"/><circle cx="8" cy="2" r="1.2"/><circle cx="13.4" cy="11.1" r="1.2"/><circle cx="2.6" cy="11.1" r="1.2"/></svg>',
  pillars: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5.5 8 2l6 3.5Z"/><path d="M3.5 7v5.5M8 7v5.5M12.5 7v5.5M2 14h12"/></svg>',
  tree:    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="3" rx="0.8"/><path d="M8 4.5v2.5M3 9V7h10v2"/><rect x="1.2" y="9.5" width="3.6" height="3" rx="0.8"/><rect x="6.2" y="9.5" width="3.6" height="3" rx="0.8"/><rect x="11.2" y="9.5" width="3.6" height="3" rx="0.8"/><path d="M8 7v2.5"/></svg>',
};

export const BREAKDOWN_DESIGNS: BlockDesign<BreakdownVariant>[] = BREAKDOWN_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.breakdown.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.breakdown;
  const bar = blockPill('data-breakdown-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const set = (a: BreakdownSettings) => { const p = pos(); if (p !== null) setBreakdownSettings(view, p, a); };
  const spectrum = attrs.colours === 'spectrum';
  const colours = pillButton(LABELS.noteBlocks.cycle.colourTitle(spectrum ? LABELS.noteBlocks.cycle.colours.spectrum : LABELS.noteBlocks.cycle.colours.accent), () => set({ colours: spectrum ? 'accent' : 'spectrum' }));
  colours.setAttribute('data-bd-tool', 'colours');
  colours.setAttribute('aria-pressed', String(spectrum));
  const add = pillButton(L.addPart, () => { const p = pos(); if (p !== null) addPart(view, p); }, `+ ${L.addPart}`);
  add.setAttribute('data-bd-tool', 'add');
  bar.append(designButtons(BREAKDOWN_DESIGNS, attrs.variant as BreakdownVariant, (v) => set({ variant: v })), colours, add, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

function breakdownDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.breakdown;
  const current = breakdownAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'breakdown') return !node.isTextblock;
    const k = t++;
    const n = partCount(node);
    const variant = node.attrs.variant as BreakdownVariant;
    const editing = current?.pos === pos;
    const spectrum = node.attrs.colours === 'spectrum';
    decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `--bd-n: ${n}`, ...(editing ? { 'data-bd-current': '' } : {}) }));
    const key = `${variant}-${node.attrs.colours}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node.attrs),
      { side: -1, key: `breakdown-tools-${k}-${key}`, ignoreSelection: true, stopEvent: () => true }));
    const whole = node.child(0);
    if (whole.content.size === 0) decos.push(Decoration.node(pos + 1, pos + 1 + whole.nodeSize, { 'data-bd-empty': '', 'data-bd-placeholder': L.wholePlaceholder }));
    if (variant === 'hub') {
      decos.push(Decoration.widget(pos + 1 + whole.nodeSize, () => spokesWidget(n),
        { side: -1, key: `breakdown-spokes-${k}-${n}`, ignoreSelection: true, stopEvent: () => true }));
    }
    node.forEach((part, offset, ci) => {
      if (ci === 0) return;
      const i = ci - 1;
      const pp = pos + 1 + offset;
      const style: string[] = [`--i: ${i}`];
      if (variant === 'hub') { const { x, y } = hubPlacement(i, n); style.push(`--x: ${x}%`, `--y: ${y}%`); }
      if (spectrum) style.push(`--part-color: hsl(${Math.round((210 + (i * 360) / n) % 360)} 62% 52%)`);
      decos.push(Decoration.node(pp, pp + part.nodeSize, { style: style.join('; ') }));
      if (n > MIN_PARTS) {
        decos.push(Decoration.widget(pp + part.nodeSize - 1, (view, getPos) => deleteWidget(view, getPos),
          { side: 1, key: `breakdown-delete-${k}-${i}`, ignoreSelection: true, stopEvent: () => true }));
      }
      const label = part.child(0);
      const text = part.child(1);
      const labelPos = pp + 1;
      const textPos = labelPos + label.nodeSize;
      if (label.content.size === 0) decos.push(Decoration.node(labelPos, textPos, { 'data-bd-empty': '', 'data-bd-placeholder': L.partPlaceholder }));
      if (text.content.size === 0) {
        decos.push(Decoration.node(textPos, textPos + text.nodeSize, editing
          ? { 'data-bd-empty': '', 'data-bd-placeholder': L.textPlaceholder }
          : { 'data-bd-hide': '' }));
      }
    });
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const breakdownKey = new PluginKey('breakdown');

// Keys and drawing, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const BreakdownBehaviour = Extension.create({
  name: 'breakdownBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(breakdownEnter),
      Tab: run(breakdownTab(1)),
      'Shift-Tab': run(breakdownTab(-1)),
      Backspace: run(breakdownBackspace),
      Delete: run(breakdownDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: breakdownKey, props: { decorations: breakdownDecorations } })];
  },
});

export const BreakdownExtensions = [Breakdown, BreakdownWhole, BreakdownPart, BreakdownLabel, BreakdownText, BreakdownBehaviour];
