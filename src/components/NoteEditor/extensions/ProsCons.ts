import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, replaceTypedWithBlock, selectButton, type BlockDesign } from './blockDesigns';

// Pros and cons (`\proscons`): one question ("Should I move to Leeds?"), what's for it, what's
// against it, each point weighted 1–3, and a verdict. Split out of the comparison block on
// 2026-10-15 (agreed with the user): a comparison is "X versus Y, point by point"; pros and cons
// weighs one thing. The options block (extensions/Options.ts) gives each option the same lists.
//
//   prosCons        variant (design: tchart / scales / ledger), frames
//   prosConsSubject what's being weighed
//   prosConsList    side attr ('pro' | 'con'): one or more points
//   prosConsPoint   weight attr (1–3): one point
//   prosConsVerdict the conclusion drawn (shows while editing, or when written)
//
// Designs: T-chart (two columns), Scales (a balance that tips towards the heavier side, from the
// summed weights), Ledger (one column of + and − points with a running total).
// Keys: Enter adds the next point, and on an empty point moves on (pros → cons → verdict); Enter
// in the verdict leaves the block; Tab / Shift+Tab move through every field; Backspace at the start
// of an empty point removes it (one point always stays), else steps back rather than merging.

export const PROSCONS_VARIANTS = ['tchart', 'scales', 'ledger'] as const;
export type ProsConsVariant = typeof PROSCONS_VARIANTS[number];
export type Side = 'pro' | 'con';
const MAX_WEIGHT = 3;

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

const textNode = (name: string, attr: string) => Node.create({
  name,
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: `div[${attr}]`, priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { [attr]: '' }), 0]; },
});

export const ProsCons = Node.create({
  name: 'prosCons',
  group: 'block',
  content: 'prosConsSubject prosConsList prosConsList prosConsVerdict',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'tchart', parseHTML: (el) => oneOf(PROSCONS_VARIANTS, el.getAttribute('data-variant'), 'tchart'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="proscons"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'proscons', 'data-note-block': '' }), 0]; },
});

export const ProsConsSubject = textNode('prosConsSubject', 'data-pc-subject');
export const ProsConsVerdict = textNode('prosConsVerdict', 'data-pc-verdict');

// A list of points, for or against: shared with the options block's options.
export const ProsConsList = Node.create({
  name: 'prosConsList',
  content: 'prosConsPoint+',
  defining: true,
  addAttributes() {
    return { side: { default: 'pro', parseHTML: (el) => oneOf(['pro', 'con'] as const, el.getAttribute('data-side'), 'pro'), renderHTML: (a) => ({ 'data-side': a.side }) } };
  },
  parseHTML() { return [{ tag: 'div[data-type="proscons-list"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'proscons-list' }), 0]; },
});

export const ProsConsPoint = Node.create({
  name: 'prosConsPoint',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      weight: {
        default: 1,
        parseHTML: (el) => Math.min(MAX_WEIGHT, Math.max(1, parseInt(el.getAttribute('data-weight') ?? '1', 10) || 1)),
        renderHTML: (a) => ({ 'data-weight': String(a.weight) }),
      },
    };
  },
  parseHTML() { return [{ tag: 'div[data-pc-point]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-pc-point': '' }), 0]; },
});

// ── Shared: fields, lists and weights (also used by the options block) ──────

// Every text field inside `node` (at `pos`), in reading order, by where it starts.
export function textFieldsIn(node: PMNode, pos: number): { pos: number; node: PMNode }[] {
  const out: { pos: number; node: PMNode }[] = [];
  node.descendants((n, p) => {
    if (n.isTextblock) { out.push({ pos: pos + 1 + p, node: n }); return false; }
    return true;
  });
  return out;
}
const fieldEnd = (f: { pos: number; node: PMNode }) => f.pos + 1 + f.node.content.size;

// The summed weight of a list's points that have something written.
export const listWeight = (list: PMNode) => {
  let w = 0;
  list.forEach((p) => { if (p.textContent.trim()) w += p.attrs.weight as number; });
  return w;
};

// The scales' tilt, in degrees: towards the heavier side, a few degrees per point of weight.
export const scalesTilt = (pros: number, cons: number) => Math.max(-14, Math.min(14, (cons - pros) * 4));

// Pros and cons of `subject`: what the pros-and-cons offer (BlockOffers.ts) puts after "The pros
// and cons of …:".
export function prosConsNodeFor(state: EditorState, subject: string): PMNode {
  const { prosCons, prosConsSubject, prosConsVerdict } = state.schema.nodes;
  return prosCons.create(null, [prosConsSubject.create(null, subject ? state.schema.text(subject) : null), ...newLists(state), prosConsVerdict.create()]);
}

export function newLists(state: EditorState): PMNode[] {
  const { prosConsList, prosConsPoint } = state.schema.nodes;
  return (['pro', 'con'] as const).map((side) => prosConsList.create({ side }, prosConsPoint.create()));
}

export function setPointWeight(view: EditorView, pos: number, weight: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'prosConsPoint') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, weight: Math.min(MAX_WEIGHT, Math.max(1, weight)) }));
}

// The weight dots before a point (●○○): a click steps it 1 → 2 → 3 → 1.
export function weightWidget(view: EditorView, getPos: () => number | undefined, weight: number): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-pc-weight', String(weight));
  const L = LABELS.noteBlocks.prosCons;
  b.title = L.weightTitle(weight);
  b.setAttribute('aria-label', L.weightTitle(weight));
  for (let i = 1; i <= MAX_WEIGHT; i++) {
    const dot = document.createElement('i');
    if (i <= weight) dot.setAttribute('data-on', '');
    b.append(dot);
  }
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p === undefined || !view.editable) return;
    setPointWeight(view, p - 1, (weight % MAX_WEIGHT) + 1);
  });
  return b;
}

// The point the selection is in, if any: its position and its list's.
export function pointAt($pos: ResolvedPos): { point: PMNode; pos: number; list: PMNode; listPos: number; index: number } | null {
  if ($pos.parent.type.name !== 'prosConsPoint' || $pos.depth < 2) return null;
  const d = $pos.depth;
  return { point: $pos.parent, pos: $pos.before(d), list: $pos.node(d - 1), listPos: $pos.before(d - 1), index: $pos.index(d - 1) };
}

// Decorations for one list (the side's heading lives in CSS, from data-side): each point's weight
// dots, its placeholder, and a running total for the ledger.
export function listDecorations(decos: Decoration[], list: PMNode, listPos: number, key: string): void {
  const L = LABELS.noteBlocks.prosCons;
  const side = list.attrs.side as Side;
  decos.push(Decoration.node(listPos, listPos + list.nodeSize, { 'data-pc-label': side === 'pro' ? L.pros : L.cons }));
  let p = listPos + 1;
  list.forEach((point, _o, i) => {
    const end = p + point.nodeSize;
    const weight = point.attrs.weight as number;
    decos.push(Decoration.widget(p + 1, (view, getPos) => weightWidget(view, getPos, weight),
      { side: -1, key: `${key}-w-${i}-${weight}`, ignoreSelection: true, stopEvent: () => true }));
    if (point.content.size === 0) decos.push(Decoration.node(p, end, { 'data-pc-empty': '', 'data-pc-placeholder': side === 'pro' ? L.proPlaceholder : L.conPlaceholder }));
    p = end;
  });
}

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// Enter in a points list, shared by both blocks. In a point with text: a new point after it. In an
// empty last point: on to the next field after the list (the empty point goes, unless it's the
// only one), or, past `blockEnd`, `onPast` (the block leaves). null when not in a point.
export function pointsEnter(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, blockEnd: number, onPast: (tr: Transaction) => void): boolean | null {
  const at = pointAt(state.selection.$from);
  if (!at) return null;
  const isLast = at.index === at.list.childCount - 1;
  if (at.point.content.size > 0 || !isLast) {
    if (at.point.content.size === 0) return null;
    if (dispatch) {
      const after = at.pos + at.point.nodeSize;
      const tr = state.tr.insert(after, state.schema.nodes.prosConsPoint.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
    }
    return true;
  }
  if (!dispatch) return true;
  const tr = state.tr;
  let after = at.listPos + at.list.nodeSize;
  let end = blockEnd;
  if (at.list.childCount > 1) {
    tr.delete(at.pos, at.pos + at.point.nodeSize);
    after -= at.point.nodeSize;
    end -= at.point.nodeSize;
  }
  const next = Selection.findFrom(tr.doc.resolve(after), 1, true);
  if (next && next.from < end) dispatch(tr.setSelection(next).scrollIntoView());
  else onPast(tr);
  return true;
}

// ── The pros and cons block ──────────────────────────────────────────────────

interface PcAt { node: PMNode; pos: number }
function prosConsAt($pos: ResolvedPos): PcAt | null {
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === 'prosCons') return { node: $pos.node(d), pos: $pos.before(d) };
  return null;
}

export function insertProsCons(state: EditorState, from: number, to: number): Transaction | null {
  const { prosCons, prosConsSubject, prosConsVerdict } = state.schema.nodes;
  if (!prosCons) return null;
  const made = replaceTypedWithBlock(state, from, to, prosCons.create(null, [prosConsSubject.create(), ...newLists(state), prosConsVerdict.create()]));
  if (!made) return null;
  const { tr, at } = made;
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

export function setProsConsVariant(view: EditorView, pos: number, variant: ProsConsVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'prosCons') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

export function prosConsPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="proscons"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'prosCons' ? pos : null;
  } catch { return null; }
}

function caretTo(state: EditorState, pos: number, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  return true;
}

// Moves the cursor to the field after (dir 1) or before (dir -1) the one it's in, within `block`.
export function stepField(state: EditorState, block: PcAt, dir: 1 | -1, dispatch?: (tr: Transaction) => void): boolean {
  const fields = textFieldsIn(block.node, block.pos);
  const here = state.selection.from;
  const i = fields.findIndex((f) => here > f.pos && here <= fieldEnd(f));
  const next = fields[i + dir];
  return next ? caretTo(state, fieldEnd(next), dispatch) : true;
}

function leaveBlock(state: EditorState, block: PcAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const after = block.pos + block.node.nodeSize;
  const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  return true;
}

export const prosConsEnter: Command = (state, dispatch) => {
  const b = prosConsAt(state.selection.$from);
  if (!b) return false;
  if (state.selection.$from.parent.type.name === 'prosConsVerdict') return leaveBlock(state, b, dispatch);
  const end = b.pos + b.node.nodeSize;
  const viaPoints = pointsEnter(state, dispatch, end, (tr) => dispatch?.(tr));
  return viaPoints ?? stepField(state, b, 1, dispatch);
};

export const prosConsTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const b = prosConsAt(state.selection.$from);
  return b ? stepField(state, b, dir, dispatch) : false;
};

export const prosConsBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const b = prosConsAt($from);
  if (!b) return false;
  if ($from.parent.type.name === 'prosConsSubject') {
    if (b.node.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(b.pos, b.pos + b.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, b.pos + 1)));
    }
    return true;
  }
  const at = pointAt($from);
  if (at && at.point.content.size === 0 && at.list.childCount > 1) {
    if (dispatch) {
      const tr = state.tr.delete(at.pos, at.pos + at.point.nodeSize);
      dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at.pos), -1)).scrollIntoView());
    }
    return true;
  }
  return stepField(state, b, -1, dispatch);
};

export const prosConsDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!prosConsAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<ProsConsVariant, string> = {
  tchart: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h13M8 3.5v10"/><path d="M3 6.5h3M3 9h3M10 6.5h3M10 9h3"/></svg>',
  scales: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v11M5 13.5h6M2.5 5l11-1.5"/><path d="M2.5 5 1 9h3ZM13.5 3.5 12 7.5h3Z"/></svg>',
  ledger: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h2M3 2.5v2M2 7.5h2M2 11.5h2"/><path d="M6 3.5h8M6 7.5h8M6 11.5h6"/><path d="M1.5 14h13"/></svg>',
};

export const PROSCONS_DESIGNS: BlockDesign<ProsConsVariant>[] = PROSCONS_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.prosCons.designs[id], icon: DESIGN_ICONS[id] }));

// The balance (Scales design): a beam on a post, tilted from the weights, a pan hanging off each end.
function scalesWidget(tilt: number): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-pc-scales', '');
  el.setAttribute('aria-hidden', 'true');
  el.contentEditable = 'false';
  el.style.setProperty('--tilt', `${tilt}deg`);
  el.innerHTML = '<svg viewBox="0 0 200 80"><path data-post d="M100 20V74M80 76h40"/><g data-beam><path d="M28 20h144"/><circle cx="100" cy="20" r="4"/>'
    + '<path data-pan="pro" d="M28 20 16 46h24ZM10 46a18 6 0 0 0 36 0"/><path data-pan="con" d="M172 20l-12 26h24ZM154 46a18 6 0 0 0 36 0"/></g></svg>';
  return el;
}

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const bar = blockPill('data-proscons-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  bar.append(designButtons(PROSCONS_DESIGNS, attrs.variant as ProsConsVariant, (v) => { const p = pos(); if (p !== null) setProsConsVariant(view, p, v); }), frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

function prosConsDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.prosCons;
  const current = prosConsAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'prosCons') return !node.isTextblock;
    const k = t++;
    const variant = node.attrs.variant as ProsConsVariant;
    const editing = current?.pos === pos;
    const pros = listWeight(node.child(1));
    const cons = listWeight(node.child(2));
    const net = pros - cons;
    decos.push(Decoration.node(pos, pos + node.nodeSize, {
      'data-pc-net': L.net(net),
      'data-pc-lean': net > 0 ? 'pro' : net < 0 ? 'con' : 'even',
      ...(editing ? { 'data-pc-current': '' } : {}),
    }));
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node.attrs),
      { side: -1, key: `pc-tools-${k}-${variant}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    const subject = node.child(0);
    if (subject.content.size === 0) decos.push(Decoration.node(pos + 1, pos + 1 + subject.nodeSize, { 'data-pc-empty': '', 'data-pc-placeholder': L.subjectPlaceholder }));
    let p = pos + 1 + subject.nodeSize;
    if (variant === 'scales') decos.push(Decoration.widget(p, () => scalesWidget(scalesTilt(pros, cons)), { side: -1, key: `pc-scales-${k}-${pros}-${cons}`, ignoreSelection: true }));
    for (const i of [1, 2]) {
      listDecorations(decos, node.child(i), p, `pc-${k}-${i}`);
      p += node.child(i).nodeSize;
    }
    const verdict = node.child(3);
    if (verdict.content.size === 0) {
      decos.push(Decoration.node(p, p + verdict.nodeSize, editing ? { 'data-pc-empty': '', 'data-pc-placeholder': L.verdictPlaceholder } : { 'data-pc-hide': '' }));
    }
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const prosConsKey = new PluginKey('prosCons');

export const ProsConsBehaviour = Extension.create({
  name: 'prosConsBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(prosConsEnter),
      Tab: run(prosConsTab(1)),
      'Shift-Tab': run(prosConsTab(-1)),
      Backspace: run(prosConsBackspace),
      Delete: run(prosConsDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: prosConsKey, props: { decorations: prosConsDecorations } })];
  },
});

export const ProsConsExtensions = [ProsCons, ProsConsSubject, ProsConsList, ProsConsPoint, ProsConsVerdict, ProsConsBehaviour];
