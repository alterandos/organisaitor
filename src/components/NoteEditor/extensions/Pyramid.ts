import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, selectButton, type BlockDesign } from './blockDesigns';

// A pyramid in a note (`\pyramid`): layers that build on each other, the first at the top —
// Maslow's needs, the food chain, a funnel from awareness to purchase. At least two layers.
//
//   pyramid        variant (design: pyramid / funnel / stacked), colours (accent / spectrum), frames
//   pyramidLayer   one layer: its label (drawn in the shape), then a short note beside it
//   pyramidLabel / pyramidText   the layer's two lines
//
// Keys, as a breakdown's: Enter goes label → its note → the next layer (an empty one if it's
// waiting, else a new one); Enter in an empty layer leaves the pyramid (removing the layer if more
// than two would remain); Tab / Shift+Tab between layers; Backspace steps back.

export const PYRAMID_VARIANTS = ['pyramid', 'funnel', 'stacked'] as const;
export type PyramidVariant = typeof PYRAMID_VARIANTS[number];
export const MIN_LAYERS = 2;
const DEFAULT_LAYERS = 3;

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const Pyramid = Node.create({
  name: 'pyramid',
  group: 'block',
  content: `pyramidLayer{${MIN_LAYERS},}`,
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'pyramid', parseHTML: (el) => oneOf(PYRAMID_VARIANTS, el.getAttribute('data-variant'), 'pyramid'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      colours: { default: 'accent', parseHTML: (el) => oneOf(['accent', 'spectrum'] as const, el.getAttribute('data-colours'), 'accent'), renderHTML: (a) => ({ 'data-colours': a.colours }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="pyramid"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'pyramid', 'data-note-block': '' }), 0]; },
});

export const PyramidLayer = Node.create({
  name: 'pyramidLayer',
  content: 'pyramidLabel pyramidText',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-type="pyramid-layer"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'pyramid-layer' }), 0]; },
});

export const PyramidLabel = Node.create({
  name: 'pyramidLabel',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-py-label]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-py-label': '' }), 0]; },
});

export const PyramidText = Node.create({
  name: 'pyramidText',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-py-text]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-py-text': '' }), 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface PyramidAt {
  node:  PMNode;
  pos:   number;
  part:  'label' | 'text';
  index: number;          // which layer
}

function pyramidAt($pos: ResolvedPos): PyramidAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'pyramid') continue;
    const index = d < $pos.depth ? $pos.index(d) : 0;
    const inLayer = d + 1 < $pos.depth ? $pos.index(d + 1) : 0;
    return { node: $pos.node(d), pos: $pos.before(d), part: inLayer === 0 ? 'label' : 'text', index };
  }
  return null;
}

function layerPos(node: PMNode, pos: number, index: number): number {
  let p = pos + 1;
  for (let i = 0; i < index; i++) p += node.child(i).nodeSize;
  return p;
}
const isEmptyLayer = (layer: PMNode) => layer.textContent.trim() === '';
const labelEnd = (node: PMNode, pos: number, index: number) => layerPos(node, pos, index) + 2 + node.child(index).child(0).content.size;
const textEnd = (node: PMNode, pos: number, index: number) => {
  const layer = node.child(index);
  return layerPos(node, pos, index) + 1 + layer.child(0).nodeSize + 1 + layer.child(1).content.size;
};

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

const newLayer = (state: EditorState) => state.schema.nodes.pyramidLayer.create(null, [
  state.schema.nodes.pyramidLabel.create(),
  state.schema.nodes.pyramidText.create(),
]);

// `\pyramid`: replaces from..to (what was typed and the space before it) with a pyramid of three
// empty layers, the cursor in the top one.
export function insertPyramid(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.pyramid;
  if (!type) return null;
  const $start = state.doc.resolve(from);
  while (from > $start.start() && /\s/.test(state.doc.textBetween(from - 1, from))) from--;
  const node = type.create(null, Array.from({ length: DEFAULT_LAYERS }, () => newLayer(state)));
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
  return tr.setSelection(TextSelection.create(tr.doc, at + 3)).scrollIntoView();
}

export type PyramidSettings = Partial<{ variant: PyramidVariant; colours: 'accent' | 'spectrum' }>;

export function setPyramidSettings(view: EditorView, pos: number, attrs: PyramidSettings): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'pyramid') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

// A new layer at the bottom (or the top, with atTop).
export function addLayer(view: EditorView, pos: number, atTop = false): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'pyramid') return;
  const at = atTop ? pos + 1 : pos + node.nodeSize - 1;
  const tr = view.state.tr.insert(at, newLayer(view.state));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

export const canDeleteLayer = (state: EditorState, pos: number) => {
  const parent = state.doc.resolve(pos).parent;
  return parent.type.name === 'pyramid' && parent.childCount > MIN_LAYERS;
};

export function deleteLayer(view: EditorView, pos: number): boolean {
  const layer = view.state.doc.nodeAt(pos);
  if (layer?.type.name !== 'pyramidLayer' || !canDeleteLayer(view.state, pos)) return false;
  const tr = view.state.tr.delete(pos, pos + layer.nodeSize);
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(pos), -1)).scrollIntoView());
  view.focus();
  return true;
}

export function pyramidPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="pyramid"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'pyramid' ? pos : null;
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

function caretTo(state: EditorState, pos: number, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  return true;
}

function leave(state: EditorState, p: PyramidAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const tr = state.tr;
  let end = p.pos + p.node.nodeSize;
  if (p.node.childCount > MIN_LAYERS) {
    const lp = layerPos(p.node, p.pos, p.index);
    const size = p.node.child(p.index).nodeSize;
    tr.delete(lp, lp + size);
    end -= size;
  }
  tr.insert(end, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  return true;
}

export const pyramidEnter: Command = (state, dispatch) => {
  const p = pyramidAt(state.selection.$from);
  if (!p) return false;
  const layer = p.node.child(p.index);
  if (isEmptyLayer(layer)) return leave(state, p, dispatch);
  if (p.part === 'label') return caretTo(state, textEnd(p.node, p.pos, p.index), dispatch);
  if (p.index + 1 < p.node.childCount && isEmptyLayer(p.node.child(p.index + 1))) return caretTo(state, labelEnd(p.node, p.pos, p.index + 1), dispatch);
  if (dispatch) {
    const at = layerPos(p.node, p.pos, p.index) + layer.nodeSize;
    const tr = state.tr.insert(at, newLayer(state));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  }
  return true;
};

export const pyramidTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const p = pyramidAt(state.selection.$from);
  if (!p) return false;
  const next = p.index + dir;
  if (next < 0 || next >= p.node.childCount) return true;
  return caretTo(state, labelEnd(p.node, p.pos, next), dispatch);
};

export const pyramidBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const p = pyramidAt($from);
  if (!p) return false;
  if (p.part === 'text') return caretTo(state, labelEnd(p.node, p.pos, p.index), dispatch);
  if (p.index === 0) {
    if (p.node.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(p.pos, p.pos + p.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, p.pos + 1)));
    }
    return true;
  }
  const layer = p.node.child(p.index);
  const prevEnd = textEnd(p.node, p.pos, p.index - 1);
  if (isEmptyLayer(layer) && p.node.childCount > MIN_LAYERS) {
    if (dispatch) {
      const lp = layerPos(p.node, p.pos, p.index);
      const tr = state.tr.delete(lp, lp + layer.nodeSize);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, prevEnd)).scrollIntoView());
    }
    return true;
  }
  return caretTo(state, prevEnd, dispatch);
};

export const pyramidDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!pyramidAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

// Layer i of n's width at its top and bottom edges, as fractions of the full width. A pyramid
// widens from a point; a funnel narrows to a spout; stacked bars step out evenly.
export function layerWidths(variant: PyramidVariant, i: number, n: number): { top: number; bottom: number } {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  if (variant === 'funnel') {
    const min = 0.28;
    return { top: r(1 - ((1 - min) * i) / n), bottom: r(1 - ((1 - min) * (i + 1)) / n) };
  }
  if (variant === 'stacked') {
    const w = r(0.4 + (0.6 * (i + 1)) / n);
    return { top: w, bottom: w };
  }
  return { top: r(i / n), bottom: r((i + 1) / n) };
}

function deleteWidget(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-py-delete', '');
  b.title = LABELS.noteBlocks.pyramid.deleteLayer;
  b.setAttribute('aria-label', LABELS.noteBlocks.pyramid.deleteLayer);
  b.textContent = '×';
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p !== undefined && view.editable) deleteLayer(view, view.state.doc.resolve(p).before());
  });
  return b;
}

const DESIGN_ICONS: Record<PyramidVariant, string> = {
  pyramid: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 14.5 14H1.5Z"/><path d="M5.6 6.3h4.8M3.4 10.2h9.2"/></svg>',
  funnel:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 2h13l-4 12h-5Z"/><path d="M2.9 6h10.2M4.2 10h7.6"/></svg>',
  stacked: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="1.8" width="6" height="3" rx="0.8"/><rect x="3.2" y="6.5" width="9.6" height="3" rx="0.8"/><rect x="1.4" y="11.2" width="13.2" height="3" rx="0.8"/></svg>',
};

export const PYRAMID_DESIGNS: BlockDesign<PyramidVariant>[] = PYRAMID_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.pyramid.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.pyramid;
  const C = LABELS.noteBlocks.cycle;
  const bar = blockPill('data-pyramid-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const set = (a: PyramidSettings) => { const p = pos(); if (p !== null) setPyramidSettings(view, p, a); };
  const spectrum = attrs.colours === 'spectrum';
  const colours = pillButton(C.colourTitle(spectrum ? C.colours.spectrum : C.colours.accent), () => set({ colours: spectrum ? 'accent' : 'spectrum' }));
  colours.setAttribute('data-py-tool', 'colours');
  colours.setAttribute('aria-pressed', String(spectrum));
  const add = pillButton(L.addLayer, () => { const p = pos(); if (p !== null) addLayer(view, p); }, `+ ${L.addLayer}`);
  add.setAttribute('data-py-tool', 'add');
  bar.append(designButtons(PYRAMID_DESIGNS, attrs.variant as PyramidVariant, (v) => set({ variant: v })), colours, add, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

function pyramidDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.pyramid;
  const current = pyramidAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'pyramid') return !node.isTextblock;
    const k = t++;
    const n = node.childCount;
    const variant = node.attrs.variant as PyramidVariant;
    const editing = current?.pos === pos;
    const spectrum = node.attrs.colours === 'spectrum';
    let notes = false;
    node.forEach((layer) => { if (layer.child(1).content.size > 0) notes = true; });
    decos.push(Decoration.node(pos, pos + node.nodeSize, {
      style: `--py-n: ${n}`,
      ...(editing ? { 'data-py-current': '' } : {}),
      ...(notes || editing ? {} : { 'data-py-nonotes': '' }),
    }));
    const key = `${variant}-${node.attrs.colours}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node.attrs),
      { side: -1, key: `pyramid-tools-${k}-${key}`, ignoreSelection: true, stopEvent: () => true }));
    node.forEach((layer, offset, i) => {
      const lp = pos + 1 + offset;
      const { top, bottom } = layerWidths(variant, i, n);
      // The label's room: the shape's width halfway down (a pyramid's point: lower, where it's wider).
      const room = variant === 'pyramid' && i === 0 ? bottom * 0.8 : (top + bottom) / 2;
      const style = [`--i: ${i}`, `--top: ${top * 100}%`, `--bottom: ${bottom * 100}%`, `--room: ${Math.round(room * 1000) / 10}%`];
      style.push(spectrum
        ? `--layer-color: hsl(${Math.round((210 + (i * 300) / Math.max(1, n - 1)) % 360)} 62% 52%)`
        : `--layer-mix: ${Math.round(34 - (20 * i) / Math.max(1, n - 1))}%`);
      decos.push(Decoration.node(lp, lp + layer.nodeSize, { style: style.join('; ') }));
      if (n > MIN_LAYERS) {
        decos.push(Decoration.widget(lp + layer.nodeSize - 1, (view, getPos) => deleteWidget(view, getPos),
          { side: 1, key: `pyramid-delete-${k}-${i}`, ignoreSelection: true, stopEvent: () => true }));
      }
      const label = layer.child(0);
      const text = layer.child(1);
      const labelPos = lp + 1;
      const textPos = labelPos + label.nodeSize;
      if (label.content.size === 0) decos.push(Decoration.node(labelPos, textPos, { 'data-py-empty': '', 'data-py-placeholder': i === 0 ? L.topPlaceholder : L.layerPlaceholder }));
      if (text.content.size === 0) {
        decos.push(Decoration.node(textPos, textPos + text.nodeSize, editing
          ? { 'data-py-empty': '', 'data-py-placeholder': L.textPlaceholder }
          : { 'data-py-hide': '' }));
      }
    });
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const pyramidKey = new PluginKey('pyramid');

// Keys and drawing, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const PyramidBehaviour = Extension.create({
  name: 'pyramidBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(pyramidEnter),
      Tab: run(pyramidTab(1)),
      'Shift-Tab': run(pyramidTab(-1)),
      Backspace: run(pyramidBackspace),
      Delete: run(pyramidDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: pyramidKey, props: { decorations: pyramidDecorations } })];
  },
});

export const PyramidExtensions = [Pyramid, PyramidLayer, PyramidLabel, PyramidText, PyramidBehaviour];
