import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { NoteEditorMenuApi } from '../contextMenu';
import { blockFrameAttributes, blockPill, designButtons, designMenuItem, frameButtons, frameMenuItem, pillButton, replaceTypedWithBlock, selectButton, type BlockDesign } from './blockDesigns';
import { chainOf, fishboneLayout, parseLinks, toggleLink, type CeLink } from './causeEffectChain';

// Cause and effect in a note (`\cause`, asked for by the user 2026-10-23): what leads to what,
// many to many, traced along. Columns (Causes, Effects, and more: "then" columns for knock-on
// effects), each a heading and its items; links go from an item to items in the next column.
//
//   causeEffect  variant: 'flow' (columns side by side, arrows between them) | 'list' (one column
//                under another, each item saying what it leads to and comes from) | 'fishbone'
//                (an Ishikawa diagram: causeEffectChain.ts fishboneLayout); links: the
//                links, "fromId>toId" (causeEffectChain.ts)
//   ceColumn     a heading, then one or more items
//   ceHead       the column's name ("Causes")
//   ceItem       one cause or effect; cid: its lasting id (unique in the note, made fresh for a copy)
//
// Linking: the dot at an item's right (or its right-click "Leads to ▸") then an item in the next
// column links or unlinks the two. Tracing: with the cursor in an item, or the mouse over one, its
// whole chain (everything it leads to and comes from, along the links) is lit and the rest fades.
// Keys: Enter adds the next item (on an empty one: on to the next column, then out), Tab /
// Shift+Tab move across columns, Backspace on an empty item removes it.

export const CE_VARIANTS = ['flow', 'list', 'fishbone'] as const;
export type CeVariant = typeof CE_VARIANTS[number];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
const newId = () => nanoid(8);

export const CauseEffectBlock = Node.create({
  name: 'causeEffect',
  group: 'block',
  content: 'ceColumn ceColumn+',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'flow', parseHTML: (el) => oneOf(CE_VARIANTS, el.getAttribute('data-variant'), 'flow'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      links: {
        default: [],
        parseHTML: (el) => parseLinks(el.getAttribute('data-links')),
        renderHTML: (a) => ((a.links as CeLink[])?.length ? { 'data-links': JSON.stringify(a.links) } : {}),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="cause-effect"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'cause-effect', 'data-note-block': '' }), 0]; },
});

export const CeColumn = Node.create({
  name: 'ceColumn',
  content: 'ceHead ceItem+',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-ce-column]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-ce-column': '' }), 0]; },
});

export const CeHead = Node.create({
  name: 'ceHead',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-ce-head]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-ce-head': '' }), 0]; },
});

export const CeItem = Node.create({
  name: 'ceItem',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { cid: { default: '', parseHTML: (el) => el.getAttribute('data-cid') ?? '', renderHTML: (a) => ({ 'data-cid': a.cid }) } };
  },
  parseHTML() { return [{ tag: 'div[data-ce-item]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-ce-item': '' }), 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface CeAt { node: PMNode; pos: number; col: number; colPos: number; item: number }   // item -1: the heading

function ceAt($pos: ResolvedPos): CeAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'causeEffect') continue;
    if (d + 1 > $pos.depth) return { node: $pos.node(d), pos: $pos.before(d), col: 0, colPos: $pos.before(d) + 1, item: -1 };
    const col = $pos.index(d);
    const item = d + 2 <= $pos.depth ? $pos.index(d + 1) - 1 : -1;
    return { node: $pos.node(d), pos: $pos.before(d), col, colPos: $pos.before(d + 1), item };
  }
  return null;
}

const colStart = (node: PMNode, pos: number, col: number) => {
  let p = pos + 1;
  for (let i = 0; i < col; i++) p += node.child(i).nodeSize;
  return p;
};
// The start of a column's part `part` (0 the heading, 1… the items).
const partStart = (node: PMNode, pos: number, col: number, part: number) => {
  let p = colStart(node, pos, col) + 1;
  const column = node.child(col);
  for (let i = 0; i < part; i++) p += column.child(i).nodeSize;
  return p;
};
const endOf = (doc: PMNode, start: number) => start + 1 + doc.nodeAt(start)!.content.size;

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making one ───────────────────────────────────────────────────────────────

export function causeEffectNode(state: EditorState, heads: string[] = [LABELS.noteBlocks.causeEffect.causes, LABELS.noteBlocks.causeEffect.effects]): PMNode {
  const { causeEffect, ceColumn, ceHead, ceItem } = state.schema.nodes;
  return causeEffect.create(null, heads.map((h) => ceColumn.create(null, [ceHead.create(null, h ? state.schema.text(h) : null), ceItem.create({ cid: newId() })])));
}

// `\cause`: Causes and Effects, the cursor on the first cause.
export function insertCauseEffect(state: EditorState, from: number, to: number): Transaction | null {
  if (!state.schema.nodes.causeEffect) return null;
  const node = causeEffectNode(state);
  const made = replaceTypedWithBlock(state, from, to, node);
  if (!made) return null;
  const first = partStart(node, made.at, 0, 1);
  return made.tr.setSelection(TextSelection.create(made.tr.doc, first + 1)).scrollIntoView();
}

export function setCeAttrs(view: EditorView, pos: number, attrs: Partial<{ variant: CeVariant; links: CeLink[] }>): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'causeEffect') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

// A new column at the end ("then": what the last effects lead to).
export function addCeColumn(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'causeEffect') return;
  const { ceColumn, ceHead, ceItem } = view.state.schema.nodes;
  const at = pos + node.nodeSize - 1;
  const column = ceColumn.create(null, [ceHead.create(null, view.state.schema.text(LABELS.noteBlocks.causeEffect.then)), ceItem.create({ cid: newId() })]);
  const tr = view.state.tr.insert(at, column);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1 + column.child(0).nodeSize + 1)).scrollIntoView());
  view.focus();
}

// An item at the end of a column, the cursor in it.
export function addCeItem(view: EditorView, pos: number, col: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'causeEffect' || col >= node.childCount) return;
  const at = colStart(node, pos, col) + node.child(col).nodeSize - 1;
  const tr = view.state.tr.insert(at, view.state.schema.nodes.ceItem.create({ cid: newId() }));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
  view.focus();
}

export function cePosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="cause-effect"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'causeEffect' ? pos : null;
  } catch { return null; }
}

// Each item's id and text, column by column.
export function ceItems(node: PMNode): { cid: string; text: string; col: number }[][] {
  const cols: { cid: string; text: string; col: number }[][] = [];
  node.forEach((column, _o, c) => {
    const items: { cid: string; text: string; col: number }[] = [];
    column.forEach((child, _p, i) => { if (i > 0) items.push({ cid: child.attrs.cid, text: child.textContent, col: c }); });
    cols.push(items);
  });
  return cols;
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const go = (state: EditorState, to: number, dispatch?: (tr: Transaction) => void, tr = state.tr) => {
  if (dispatch) dispatch(tr.setSelection(TextSelection.create(tr.doc, to)).scrollIntoView());
  return true;
};

function leave(state: EditorState, c: CeAt, dispatch?: (tr: Transaction) => void, tr = state.tr): boolean {
  const after = tr.mapping.map(c.pos + c.node.nodeSize);
  tr.insert(after, state.schema.nodes.paragraph.create());
  return go(state, after + 1, dispatch, tr);
}

export const ceEnter: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  const c = ceAt($from);
  if (!c || !$from.parent.isTextblock || !$from.sameParent($to)) return false;
  const column = c.node.child(c.col);
  if (c.item === -1) return go(state, endOf(state.doc, partStart(c.node, c.pos, c.col, 1)), dispatch);
  const item = column.child(c.item + 1);
  if (item.content.size === 0) {
    const tr = state.tr;
    const start = partStart(c.node, c.pos, c.col, c.item + 1);
    if (column.childCount > 2) tr.delete(start, start + item.nodeSize);
    const last = c.col === c.node.childCount - 1;
    if (last) return leave(state, c, dispatch, tr);
    const next = tr.doc.nodeAt(c.pos)!;
    return go(state, endOf(tr.doc, partStart(next, c.pos, c.col + 1, 1)), dispatch, tr);
  }
  if (dispatch) {
    const tr = state.tr.split($from.pos, 1, [{ type: state.schema.nodes.ceItem, attrs: { cid: newId() } }]);
    dispatch(tr.scrollIntoView());
  }
  return true;
};

const ceTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const c = ceAt(state.selection.$from);
  if (!c) return false;
  const col = c.col + dir;
  if (col < 0 || col >= c.node.childCount) return true;
  const part = Math.min(c.item + 1, c.node.child(col).childCount - 1);
  return go(state, endOf(state.doc, partStart(c.node, c.pos, col, part)), dispatch);
};

export const ceBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const c = ceAt($from);
  if (!c) return false;
  const column = c.node.child(c.col);
  if (c.item >= 0) {
    const start = partStart(c.node, c.pos, c.col, c.item + 1);
    const prevEnd = endOf(state.doc, partStart(c.node, c.pos, c.col, c.item));
    if (column.child(c.item + 1).content.size === 0 && column.childCount > 2) {
      return go(state, prevEnd, dispatch, state.tr.delete(start, start + column.child(c.item + 1).nodeSize));
    }
    return go(state, prevEnd, dispatch);
  }
  if (c.node.textContent.trim() === '' && c.col === 0) {
    if (dispatch) {
      const tr = state.tr.replaceWith(c.pos, c.pos + c.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, c.pos + 1)));
    }
    return true;
  }
  if (column.textContent.trim() === '' && c.node.childCount > 2) {
    const start = colStart(c.node, c.pos, c.col);
    const tr = state.tr.delete(start, start + column.nodeSize);
    const prev = tr.doc.nodeAt(c.pos)!;
    return go(state, endOf(tr.doc, partStart(prev, c.pos, c.col - 1, prev.child(c.col - 1).childCount - 1)), dispatch, tr);
  }
  if (c.col === 0) return true;
  return go(state, endOf(state.doc, partStart(c.node, c.pos, c.col - 1, c.node.child(c.col - 1).childCount - 1)), dispatch);
};

const ceDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!ceAt($from);
};

// ── Linking and tracing ──────────────────────────────────────────────────────

interface CeState { linkFrom: { pos: number; cid: string } | null; hover: string | null }
export const ceKey = new PluginKey<CeState>('causeEffect');

export function startLinking(view: EditorView, pos: number, cid: string): void {
  const cur = ceKey.getState(view.state)?.linkFrom;
  view.dispatch(view.state.tr.setMeta(ceKey, { linkFrom: cur?.cid === cid ? null : { pos, cid } }));
}

export function linkItems(view: EditorView, pos: number, from: string, to: string): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'causeEffect') return;
  view.dispatch(view.state.tr.setNodeAttribute(pos, 'links', toggleLink(node.attrs.links as CeLink[], from, to)).setMeta(ceKey, { linkFrom: null }));
}

// Every item id in the note is unique: a copied or split item gets a fresh one; an item with none
// gets one.
function fixIds(state: EditorState): Transaction | null {
  const seen = new Set<string>();
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'ceItem') return true;
    const cid = node.attrs.cid as string;
    if (!cid || seen.has(cid)) (tr ??= state.tr).setNodeAttribute(pos, 'cid', newId());
    else seen.add(cid);
    return false;
  });
  return tr;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function ceDecorations(state: EditorState): DecorationSet | null {
  const plugin = ceKey.getState(state);
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.causeEffect;
  const sel = ceAt(state.selection.$from);
  let n = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'causeEffect') return !node.isTextblock;
    const t = n++;
    const variant = node.attrs.variant as CeVariant;
    const links = node.attrs.links as CeLink[];
    const items = ceItems(node);
    const byId = new Map(items.flat().map((i) => [i.cid, i]));
    const editing = sel?.pos === pos;
    const cursorItem = editing && sel!.item >= 0 ? items[sel!.col]?.[sel!.item]?.cid : undefined;
    const focus = (plugin?.hover && byId.has(plugin.hover) ? plugin.hover : null) ?? cursorItem ?? null;
    const lit = focus ? chainOf(focus, links) : null;
    const linking = plugin?.linkFrom && plugin.linkFrom.pos === pos ? plugin.linkFrom : null;
    const linkCol = linking ? byId.get(linking.cid)?.col ?? -1 : -1;

    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, variant, node.attrs),
      { side: -1, key: `ce-tools-${t}-${variant}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    decos.push(Decoration.widget(pos + 1, () => arrowsHolder(), { side: -2, key: `ce-arrows-${t}`, ignoreSelection: true }));
    const blockAttrs: Record<string, string> = { 'data-ce-cols': String(node.childCount) };
    // Fishbone: every item placed on the block's grid (its columns go `display: contents`).
    const fb = variant === 'fishbone' ? fishboneLayout(items.map((c) => c.map((i) => i.cid)), links) : null;
    if (fb) blockAttrs.style = `--fb-slots: ${fb.slots}; --fb-rows: ${fb.spineRow > 1 ? `repeat(${fb.spineRow - 1}, auto) ` : ''}minmax(3rem, auto)${fb.rows > fb.spineRow ? ` repeat(${fb.rows - fb.spineRow}, auto)` : ''}`;
    if (editing) blockAttrs['data-ce-current'] = '';
    if (lit) blockAttrs['data-ce-tracing'] = '';
    if (linking) blockAttrs['data-ce-linking'] = '';
    decos.push(Decoration.node(pos, pos + node.nodeSize, blockAttrs));

    let cp = pos + 1;
    node.forEach((column, _o, c) => {
      let p = cp + 1;
      column.forEach((child, _q, i) => {
        const end = p + child.nodeSize;
        if (i === 0) {
          if (child.content.size === 0) decos.push(Decoration.node(p, end, { 'data-ce-empty': '', 'data-ce-placeholder': L.headPlaceholder }));
        } else {
          const cid = child.attrs.cid as string;
          const attrs: Record<string, string> = {};
          if (child.content.size === 0) { attrs['data-ce-empty'] = ''; attrs['data-ce-placeholder'] = c === 0 ? L.causePlaceholder : L.effectPlaceholder; }
          if (lit) attrs[lit.has(cid) ? 'data-ce-lit' : 'data-ce-dim'] = '';
          if (linking && c === linkCol + 1) {
            attrs['data-ce-target'] = '';
            if (links.some((l) => l.from === linking.cid && l.to === cid)) attrs['data-ce-linked'] = '';
          }
          if (linking?.cid === cid) attrs['data-ce-source'] = '';
          const at = fb?.place[cid];
          if (at) {
            attrs.style = `grid-column: ${at.col}; grid-row: ${at.row}`;
            attrs['data-fb-role'] = at.role;
            if (at.side) attrs['data-fb-side'] = at.side;
            if (at.major) attrs['data-fb-major'] = at.major;
          }
          decos.push(Decoration.node(p, end, attrs));
          if (c < node.childCount - 1) {
            decos.push(Decoration.widget(end - 1, (view, getPos) => connectButton(view, getPos, cid), { side: 1, key: `ce-dot-${cid}`, ignoreSelection: true, stopEvent: () => true }));
          }
          if (variant === 'list') {
            const to = links.filter((l) => l.from === cid).map((l) => byId.get(l.to)?.text).filter((x): x is string => !!x?.trim());
            const from = links.filter((l) => l.to === cid).map((l) => byId.get(l.from)?.text).filter((x): x is string => !!x?.trim());
            if (to.length || from.length) {
              decos.push(Decoration.widget(end - 1, () => listLinks(to, from), { side: 2, key: `ce-list-${cid}-${to.join('|')}-${from.join('|')}`, ignoreSelection: true }));
            }
          }
        }
        p = end;
      });
      decos.push(Decoration.widget(cp + column.nodeSize - 1, (view, getPos) => addButton(view, getPos, c, c === 0 ? L.addCause : L.addEffect), { side: 3, key: `ce-add-${t}-${c}`, ignoreSelection: true, stopEvent: () => true }));
      cp += column.nodeSize;
    });
    return false;
  });
  return n ? DecorationSet.create(state.doc, decos) : null;
}

function arrowsHolder(): HTMLElement {
  const holder = document.createElement('div');
  holder.setAttribute('data-ce-arrows', '');
  holder.setAttribute('aria-hidden', 'true');
  holder.contentEditable = 'false';
  return holder;
}

function connectButton(view: EditorView, getPos: () => number | undefined, cid: string): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('data-ce-connect', '');
  b.contentEditable = 'false';
  b.title = LABELS.noteBlocks.causeEffect.connect;
  b.setAttribute('aria-label', LABELS.noteBlocks.causeEffect.connect);
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const at = getPos();
    if (at === undefined || !view.editable) return;
    const block = cePosAt(view, b);
    if (block !== null) startLinking(view, block, cid);
  });
  return b;
}

function addButton(view: EditorView, getPos: () => number | undefined, col: number, label: string): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('data-ce-add', '');
  b.contentEditable = 'false';
  b.textContent = label;
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!view.editable || getPos() === undefined) return;
    const block = cePosAt(view, b);
    if (block !== null) addCeItem(view, block, col);
  });
  return b;
}

function listLinks(to: string[], from: string[]): HTMLElement {
  const L = LABELS.noteBlocks.causeEffect;
  const box = document.createElement('span');
  box.setAttribute('data-ce-list-links', '');
  box.contentEditable = 'false';
  for (const [label, items] of [[L.leadsTo, to], [L.comesFrom, from]] as const) {
    if (!items.length) continue;
    const line = document.createElement('span');
    line.textContent = `${label} ${items.join(', ')}`;
    box.append(line);
  }
  return box;
}

const DESIGN_ICONS: Record<CeVariant, string> = {
  flow: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="2.5" width="4" height="3" rx="1"/><rect x="1" y="10.5" width="4" height="3" rx="1"/><rect x="11" y="6.5" width="4" height="3" rx="1"/><path d="M5 4c3 0 3 4 6 4M5 12c3 0 3-4 6-4"/></svg>',
  list: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h5M2 6h9M2 8.5h7"/><path d="M2 11.5h5M3.5 14h8"/></svg>',
  fishbone: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h10.5"/><path d="M11.5 5.5h3.5v5h-3.5z"/><path d="M3 3l2.5 5M7 3l2.5 5M3 13l2.5-5M7 13l2.5-5"/></svg>',
};
export const CE_DESIGNS: BlockDesign<CeVariant>[] = CE_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.causeEffect.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, variant: CeVariant, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.causeEffect;
  const bar = blockPill('data-ce-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  bar.append(
    designButtons(CE_DESIGNS, variant, (v) => { const p = pos(); if (p !== null) setCeAttrs(view, p, { variant: v }); }),
    pillButton(L.addColumn, () => { const p = pos(); if (p !== null) addCeColumn(view, p); }, L.addColumnShort),
    frameButtons(view, getPos, attrs),
    selectButton(view, getPos),
  );
  return bar;
}

// After each render (and on resize): draws each Flow block's arrows from item to item, measured
// from the real layout, lit or faded with the trace. Read from the DOM so it follows any size.
class CeArrows {
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
    const NS = 'http://www.w3.org/2000/svg';
    for (const block of this.view.dom.querySelectorAll<HTMLElement>('[data-type="cause-effect"]')) {
      const holder = block.querySelector<HTMLElement>(':scope > [data-ce-arrows]');
      if (!holder) continue;
      holder.replaceChildren();
      const variant = block.getAttribute('data-variant');
      if (variant !== 'flow' && variant !== 'fishbone') continue;
      const box = block.getBoundingClientRect();
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', String(box.width));
      svg.setAttribute('height', String(box.height));
      const tracing = block.hasAttribute('data-ce-tracing');
      if (variant === 'fishbone') {
        this.fishbone(block, box, svg, tracing);
        holder.append(svg);
        continue;
      }
      for (const l of parseLinks(block.getAttribute('data-links'))) {
        // Ids are nanoid's URL-safe letters, so a quoted attribute value needs no escaping.
        const item = (cid: string) => (/^[\w-]+$/.test(cid) ? block.querySelector<HTMLElement>(`[data-ce-item][data-cid="${cid}"]`) : null);
        const a = item(l.from);
        const b = item(l.to);
        if (!a || !b) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const x1 = ra.right - box.left + 10, y1 = ra.top + ra.height / 2 - box.top;
        const x2 = rb.left - box.left - 4, y2 = rb.top + rb.height / 2 - box.top;
        const dx = Math.max(24, (x2 - x1) / 2);
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
        const lit = a.hasAttribute('data-ce-lit') && b.hasAttribute('data-ce-lit');
        path.setAttribute('data-state', tracing ? (lit ? 'lit' : 'dim') : 'plain');
        const head = document.createElementNS(NS, 'path');
        head.setAttribute('d', `M${x2 - 6},${y2 - 4} L${x2},${y2} L${x2 - 6},${y2 + 4}`);
        head.setAttribute('data-state', path.getAttribute('data-state')!);
        svg.append(path, head);
      }
      holder.append(svg);
    }
  }

  // The spine into the head (the effect), each main bone slanting into the spine, and each small
  // bone a short line across to its main bone, measured from where the items really are.
  private fishbone(block: HTMLElement, box: DOMRect, svg: SVGSVGElement, tracing: boolean) {
    const NS = 'http://www.w3.org/2000/svg';
    const rel = (r: DOMRect) => ({ left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top, cx: r.left + r.width / 2 - box.left, cy: r.top + r.height / 2 - box.top });
    const line = (d: string, lit: boolean | null, cls = '') => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('data-state', !tracing || lit === null ? 'plain' : lit ? 'lit' : 'dim');
      if (cls) path.setAttribute('data-fb-line', cls);
      svg.append(path);
    };
    const head = block.querySelector<HTMLElement>('[data-fb-role="head"]');
    if (!head) return;
    const h = rel(head.getBoundingClientRect());
    const spineY = h.cy;
    line(`M0,${spineY} L${h.left - 2},${spineY}`, null, 'spine');
    const bones = new Map<string, { x0: number; y0: number; x1: number }>();
    for (const major of block.querySelectorAll<HTMLElement>('[data-fb-role="major"]')) {
      const r = rel(major.getBoundingClientRect());
      const top = major.getAttribute('data-fb-side') === 'top';
      const y0 = top ? r.bottom + 2 : r.top - 2;
      const x1 = r.cx + Math.abs(spineY - y0) * 0.55;
      bones.set(major.getAttribute('data-cid') ?? '', { x0: r.cx, y0, x1 });
      line(`M${r.cx},${y0} L${x1},${spineY}`, major.hasAttribute('data-ce-lit'));
    }
    for (const minor of block.querySelectorAll<HTMLElement>('[data-fb-role="minor"]')) {
      const bone = bones.get(minor.getAttribute('data-fb-major') ?? '');
      if (!bone) continue;
      const r = rel(minor.getBoundingClientRect());
      const t = (r.cy - bone.y0) / (spineY - bone.y0 || 1);
      const x = bone.x0 + t * (bone.x1 - bone.x0);
      line(`M${r.right + 4},${r.cy} L${x},${r.cy}`, minor.hasAttribute('data-ce-lit'));
    }
  }
}

export const CauseEffectBehaviour = Extension.create({
  name: 'causeEffectBehaviour',
  priority: 110,
  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(ceEnter), Tab: run(ceTab(1)), 'Shift-Tab': run(ceTab(-1)), Backspace: run(ceBackspace), Delete: run(ceDelete),
      Escape: () => {
        if (!ceKey.getState(this.editor.state)?.linkFrom) return false;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(ceKey, { linkFrom: null }));
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin<CeState>({
      key: ceKey,
      state: {
        init: () => ({ linkFrom: null, hover: null }),
        apply: (tr, prev) => {
          const meta = tr.getMeta(ceKey) as Partial<CeState> | undefined;
          let next = meta ? { ...prev, ...meta } : prev;
          if (tr.docChanged && next.linkFrom) {
            const m = tr.mapping.mapResult(next.linkFrom.pos);
            next = m.deleted ? { ...next, linkFrom: null } : { ...next, linkFrom: { ...next.linkFrom, pos: m.pos } };
          }
          return next;
        },
      },
      appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? fixIds(state) : null),
      props: {
        decorations: ceDecorations,
        // While linking, a click on an item in the next column links (or unlinks) the two.
        handleClickOn: (view, _pos, node, nodePos) => {
          const from = ceKey.getState(view.state)?.linkFrom;
          if (!from || node.type.name !== 'ceItem') return false;
          const dom = view.nodeDOM(nodePos) as HTMLElement | null;
          if (!dom?.hasAttribute('data-ce-target')) return false;
          linkItems(view, from.pos, from.cid, node.attrs.cid);
          return true;
        },
        handleDOMEvents: {
          mouseover: (view, e) => {
            const item = (e.target as Element | null)?.closest?.('[data-ce-item]');
            const cid = item?.getAttribute('data-cid') ?? null;
            if (cid !== (ceKey.getState(view.state)?.hover ?? null)) view.dispatch(view.state.tr.setMeta(ceKey, { hover: cid }));
            return false;
          },
          mouseleave: (view) => {
            if (ceKey.getState(view.state)?.hover) view.dispatch(view.state.tr.setMeta(ceKey, { hover: null }));
            return false;
          },
        },
      },
      view: (view) => new CeArrows(view),
    })];
  },
});

export const CauseEffectExtensions = [CauseEffectBlock, CeColumn, CeHead, CeItem, CauseEffectBehaviour];

// Right-click on a cause or effect: what it leads to (a tick per item in the next column, to link
// or unlink: the keyboard and touch-free way to link), then the block's design and frame.
registerContextMenuProvider({
  id: 'note-editor.cause-effect',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="cause-effect"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = cePosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.causeEffect;
    const out = [];
    const cid = ctx.target.closest('[data-ce-item]')?.getAttribute('data-cid');
    const cols = ceItems(node);
    const col = cid ? cols.findIndex((c) => c.some((i) => i.cid === cid)) : -1;
    if (cid && col >= 0 && col < cols.length - 1) {
      const links = node.attrs.links as CeLink[];
      out.push({
        id: 'ce-leads-to', label: L.leadsToMenu,
        submenu: [cols[col + 1].map((i) => ({
          id: i.cid, label: i.text.trim() || L.untitled,
          icon: links.some((l) => l.from === cid && l.to === i.cid) ? '✓' : undefined,
          run: () => linkItems(view, pos, cid, i.cid),
        }))],
      });
    }
    out.push(designMenuItem(CE_DESIGNS, node.attrs.variant as CeVariant, (v) => setCeAttrs(view, pos, { variant: v })), frameMenuItem(view, pos, node.attrs));
    return out;
  },
});
