import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, replaceTypedWithBlock, selectButton, type BlockDesign } from './blockDesigns';

// A comparison in a note (`\compare`): two or more sides, each a title and its points (agreed with
// the user 2026-10-13). Note-taking structure, like the timeline:
//
//   compareBlock  attrs: variant (design), frames; content: two or more sides
//   compareSide   a title, then one or more points
//   compareTitle  what this side is ("Renting")
//   comparePoint  one claim ("Price: $1,800 a month")
//
// Points line up by **criterion**: the words before a colon at the start of a point ("Price: …").
// It's read from the text, never stored, so every design can use it, now and later (the user:
// "we might add more designs in the future and it might be useful in those too"). The Table design
// lays the points out with a row per criterion; the others show the criterion in bold.
//
// Keys: Enter in a title goes to its first point; Enter in a point adds the next point, and on an
// empty last point leaves the comparison. Tab / Shift+Tab move to the next / previous side.
// Backspace at the start of an empty point removes it.

// 'proscons' was a design until 2026-10-15, when pros and cons became their own block
// (extensions/ProsCons.ts); a comparison stored with it is drawn as Versus.
export const COMPARE_VARIANTS = ['versus', 'table'] as const;
export type CompareVariant = typeof COMPARE_VARIANTS[number];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const CompareBlock = Node.create({
  name: 'compareBlock',
  group: 'block',
  content: 'compareSide compareSide+',
  defining: true,
  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'versus', parseHTML: (el) => oneOf(COMPARE_VARIANTS, el.getAttribute('data-variant'), 'versus'), renderHTML: (a) => ({ 'data-variant': (COMPARE_VARIANTS as readonly string[]).includes(a.variant) ? a.variant : 'versus' }) },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="compare"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'compare', 'data-note-block': '' }), 0]; },
});

export const CompareSide = Node.create({
  name: 'compareSide',
  content: 'compareTitle comparePoint+',
  defining: true,
  isolating: true,
  parseHTML() { return [{ tag: 'div[data-cmp-side]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-cmp-side': '' }), 0]; },
});

export const CompareTitle = Node.create({
  name: 'compareTitle',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-cmp-title]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-cmp-title': '' }), 0]; },
});

export const ComparePoint = Node.create({
  name: 'comparePoint',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-cmp-point]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-cmp-point': '' }), 0]; },
});

// ── Criteria ─────────────────────────────────────────────────────────────────

// The criterion a point is about: the words before a colon at its start ("Price: …" → "Price"),
// at most 40 characters and not a time ("10:30"). Null when it has none.
export function pointCriterion(text: string): string | null {
  const m = text.match(/^\s*([^:\n]{1,40}?)\s*:(?!\d)/u);
  const c = m?.[1]?.trim();
  return c && /\p{L}/u.test(c) ? c : null;
}

const critKey = (c: string) => c.toLocaleLowerCase();

// Every criterion in the block, in the order they first appear (side by side, point by point).
export function compareCriteria(block: PMNode): string[] {
  const seen = new Map<string, string>();
  block.forEach((side) => side.forEach((part, _o, i) => {
    if (i === 0) return;
    const c = pointCriterion(part.textContent);
    if (c && !seen.has(critKey(c))) seen.set(critKey(c), c);
  }));
  return [...seen.values()];
}

// ── Positions ────────────────────────────────────────────────────────────────

interface CompareAt { block: PMNode; pos: number; sideIndex: number; sidePos: number; partIndex: number }

function compareAt($pos: ResolvedPos): CompareAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'compareBlock') continue;
    const sideIndex = d < $pos.depth ? $pos.index(d) : 0;
    const partIndex = d + 1 < $pos.depth ? $pos.index(d + 1) : 0;
    const block = $pos.node(d);
    const pos = $pos.before(d);
    let sidePos = pos + 1;
    for (let i = 0; i < sideIndex; i++) sidePos += block.child(i).nodeSize;
    return { block, pos, sideIndex, sidePos, partIndex };
  }
  return null;
}

const partPos = (sidePos: number, side: PMNode, index: number) => {
  let p = sidePos + 1;
  for (let i = 0; i < index; i++) p += side.child(i).nodeSize;
  return p;
};

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

const sideNode = (state: EditorState, title = '') => {
  const { compareSide, compareTitle, comparePoint } = state.schema.nodes;
  return compareSide.create(null, [compareTitle.create(null, title ? state.schema.text(title) : null), comparePoint.create()]);
};

// `\compare`: two empty sides, the cursor in the first title.
export function insertCompare(state: EditorState, from: number, to: number): Transaction | null {
  const { compareBlock } = state.schema.nodes;
  if (!compareBlock) return null;
  const made = replaceTypedWithBlock(state, from, to, compareBlock.create(null, [sideNode(state), sideNode(state)]));
  if (!made) return null;
  return made.tr.setSelection(TextSelection.create(made.tr.doc, made.at + 3)).scrollIntoView();
}

export function setCompareVariant(view: EditorView, pos: number, variant: CompareVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'compareBlock') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

// Another side at the end, the cursor in its title.
export function addCompareSide(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'compareBlock') return;
  const at = pos + node.nodeSize - 1;
  const tr = view.state.tr.insert(at, sideNode(view.state));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

// Removes side `index` (a comparison keeps at least two).
export function removeCompareSide(view: EditorView, pos: number, index: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'compareBlock' || node.childCount <= 2) return;
  let p = pos + 1;
  for (let i = 0; i < index; i++) p += node.child(i).nodeSize;
  view.dispatch(view.state.tr.delete(p, p + node.child(index).nodeSize));
}

export function comparePosAt(view: EditorView, el: Element): { pos: number; sideIndex: number } | null {
  const dom = el.closest('[data-type="compare"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    if (view.state.doc.nodeAt(pos)?.type.name !== 'compareBlock') return null;
    const sideEl = el.closest('[data-cmp-side]');
    const sides = [...dom.querySelectorAll(':scope > [data-cmp-side]')];
    return { pos, sideIndex: sideEl ? Math.max(0, sides.indexOf(sideEl)) : 0 };
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export const compareEnter: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const at = compareAt($from);
  if (!at || !$from.parent.isTextblock) return false;
  const side = at.block.child(at.sideIndex);
  const here = partPos(at.sidePos, side, at.partIndex);
  if (at.partIndex === 0) {
    if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, here + side.child(0).nodeSize + 1)).scrollIntoView());
    return true;
  }
  const point = side.child(at.partIndex);
  const last = at.partIndex === side.childCount - 1;
  if (point.content.size === 0 && last && at.partIndex > 1) {
    // An empty last point: it goes, and the cursor leaves the comparison.
    if (dispatch) {
      const tr = state.tr.delete(here, here + point.nodeSize);
      const after = at.pos + tr.doc.nodeAt(at.pos)!.nodeSize;
      tr.insert(after, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
    }
    return true;
  }
  if (dispatch) {
    const after = here + point.nodeSize;
    const tr = state.tr.insert(after, state.schema.nodes.comparePoint.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  }
  return true;
};

export const compareTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const at = compareAt(state.selection.$from);
  if (!at) return false;
  const next = at.sideIndex + dir;
  if (next < 0 || next >= at.block.childCount) return true;
  if (dispatch) {
    let p = at.pos + 1;
    for (let i = 0; i < next; i++) p += at.block.child(i).nodeSize;
    const side = at.block.child(next);
    const index = Math.min(at.partIndex, side.childCount - 1);
    const start = partPos(p, side, index);
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, start + 1 + side.child(index).content.size)).scrollIntoView());
  }
  return true;
};

export const compareBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const at = compareAt($from);
  if (!at) return false;
  if (at.partIndex === 0) return true;
  const side = at.block.child(at.sideIndex);
  const point = side.child(at.partIndex);
  const here = partPos(at.sidePos, side, at.partIndex);
  if (dispatch) {
    // An empty point goes (a side keeps one); either way the cursor goes to the end of the one before.
    const remove = point.content.size === 0 && side.childCount > 2;
    const tr = remove ? state.tr.delete(here, here + point.nodeSize) : state.tr;
    dispatch(tr.setSelection(TextSelection.create(tr.doc, here - 1)).scrollIntoView());
  }
  return true;
};

export const compareDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!compareAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<CompareVariant, string> = {
  versus:   '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4h5M1.5 7h4M1.5 10h5M9.5 4h5M9.5 7h4M9.5 10h5"/><path d="M8 2.5v11" stroke-dasharray="1.5 1.5"/></svg>',
  table:    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="M1.5 6h13M1.5 9.5h13M5.5 2.5v11M10 2.5v11"/></svg>',
};
export const COMPARE_DESIGNS: BlockDesign<CompareVariant>[] = COMPARE_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.compare.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.compare;
  const bar = blockPill('data-compare-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const add = pillButton(L.addSide, () => { const p = pos(); if (p !== null) addCompareSide(view, p); }, `+ ${L.side}`);
  add.setAttribute('data-cmp-tool', 'add-side');
  bar.append(designButtons(COMPARE_DESIGNS, attrs.variant as CompareVariant, (v) => { const p = pos(); if (p !== null) setCompareVariant(view, p, v); }), add, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

function rowHeader(text: string, row: number): HTMLElement {
  const el = document.createElement('div');
  el.contentEditable = 'false';
  el.setAttribute('data-cmp-row-head', '');
  el.style.gridRow = String(row);
  el.textContent = text;
  return el;
}

// Per comparison: the pill, placeholders, each point's criterion picked out (bold), and for the
// Table design where each title and point goes in the grid (computed, never stored) plus the
// criterion row headers.
function compareDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.compare;
  const current = compareAt(state.selection.$from);
  let n = 0;
  state.doc.descendants((block, pos) => {
    if (block.type.name !== 'compareBlock') return !block.isTextblock;
    const t = n++;
    const variant = block.attrs.variant as CompareVariant;
    const table = variant === 'table';
    const criteria = compareCriteria(block);
    const rowOf = new Map(criteria.map((c, i) => [critKey(c), i + 2]));
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, block.attrs),
      { side: -1, ignoreSelection: true, stopEvent: () => true, key: `cmp-tools-${t}-${variant}-${block.attrs.outlined ? 'o' : ''}${block.attrs.shaded ? 's' : ''}` }));
    decos.push(Decoration.node(pos, pos + block.nodeSize, {
      style: `--cmp-sides: ${block.childCount}`,
      ...(current?.pos === pos ? { 'data-cmp-current': '' } : {}),
    }));
    if (table) criteria.forEach((c, i) => decos.push(Decoration.widget(pos + 1, () => rowHeader(c, i + 2), { side: -1, key: `cmp-row-${t}-${i}-${c}`, ignoreSelection: true })));
    // Points without a criterion go in rows after the criteria, a side's own count.
    const extraStart = criteria.length + 2;
    let sidePos = pos + 1;
    block.forEach((side, _so, sideIndex) => {
      let extra = extraStart;
      const used = new Set<number>();
      let partStart = sidePos + 1;
      side.forEach((part, _po, i) => {
        const end = partStart + part.nodeSize;
        const empty = part.content.size === 0;
        const attrs: Record<string, string> = {};
        if (empty) { attrs['data-cmp-empty'] = ''; attrs['data-cmp-placeholder'] = i === 0 ? L.titlePlaceholder(sideIndex) : L.pointPlaceholder; }
        if (table) {
          let row = 1;
          if (i > 0) {
            const c = pointCriterion(part.textContent);
            row = c ? rowOf.get(critKey(c)) ?? extra : extra;
            while (used.has(row)) row = Math.max(row + 1, extra);
            used.add(row);
            if (row >= extra) extra = row + 1;
          }
          attrs.style = `grid-row: ${row}; grid-column: ${sideIndex + 2}`;
        }
        decos.push(Decoration.node(partStart, end, attrs));
        if (i > 0) {
          const c = pointCriterion(part.textContent);
          if (c) {
            const colon = part.textContent.indexOf(':');
            decos.push(Decoration.inline(partStart + 1, partStart + 1 + colon + 1, { 'data-cmp-crit': '' }));
          }
        }
        partStart = end;
      });
      sidePos += side.nodeSize;
    });
    return false;
  });
  return n ? DecorationSet.create(state.doc, decos) : null;
}

const compareKey = new PluginKey('compareBlock');

export const CompareBehaviour = Extension.create({
  name: 'compareBehaviour',
  priority: 110,
  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(compareEnter),
      Tab: run(compareTab(1)),
      'Shift-Tab': run(compareTab(-1)),
      Backspace: run(compareBackspace),
      Delete: run(compareDelete),
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ key: compareKey, props: { decorations: compareDecorations } })];
  },
});

export const CompareExtensions = [CompareBlock, CompareSide, CompareTitle, ComparePoint, CompareBehaviour];
