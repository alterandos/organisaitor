import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import {
  blockFrameAttributes, blockPill, designButtons, frameButtons, openBlockPopover, pillButton, popoverClass, selectButton, type BlockDesign,
} from './blockDesigns';
import { MAX_LEVEL, effectiveLevels, hierarchyLayout, subtreeEnd } from './hierarchyLayout';

// A hierarchy in a note (`\hierarchy`): things ranked inside each other — a taxonomy (Kingdom ›
// Phylum › Class…), an organisation, a classification. Written as an outline: Enter adds an item,
// Tab / Shift+Tab move it (and everything under it) a level down or up, Enter on an empty item moves
// it up a level and then out of the block. Each level can be named (its tier: "Kingdom"), shown
// beside the rows (Tree, Outline) or above the columns (Columns).
//
//   hierarchy       variant (tree / columns / outline), colours (accent / spectrum: one per level),
//                   tiers (the level names, in order), frames
//   hierarchyItem   one item: its level, and its text (in a box — data-hi-box)
//
// The items are stored flat with a level each; hierarchyLayout.ts reads the tree from them.

export const HIERARCHY_VARIANTS = ['tree', 'columns', 'outline'] as const;
export type HierarchyVariant = typeof HIERARCHY_VARIANTS[number];
const DEFAULT_LEVELS = [0, 1, 1];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

function parseTiers(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.slice(0, MAX_LEVEL + 1).map((t) => (typeof t === 'string' ? t : '')) : [];
  } catch { return []; }
}

export const Hierarchy = Node.create({
  name: 'hierarchy',
  group: 'block',
  content: 'hierarchyItem+',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'tree', parseHTML: (el) => oneOf(HIERARCHY_VARIANTS, el.getAttribute('data-variant'), 'tree'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      colours: { default: 'accent', parseHTML: (el) => oneOf(['accent', 'spectrum'] as const, el.getAttribute('data-colours'), 'accent'), renderHTML: (a) => ({ 'data-colours': a.colours }) },
      tiers: {
        default: [],
        parseHTML: (el) => parseTiers(el.getAttribute('data-tiers')),
        renderHTML: (a) => ((a.tiers as string[]).some(Boolean) ? { 'data-tiers': JSON.stringify(a.tiers) } : {}),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="hierarchy"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'hierarchy', 'data-note-block': '' }), 0]; },
});

export const HierarchyItem = Node.create({
  name: 'hierarchyItem',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      level: {
        default: 0,
        parseHTML: (el) => Math.max(0, Math.min(MAX_LEVEL, parseInt(el.getAttribute('data-level') ?? '0', 10) || 0)),
        renderHTML: (a) => ({ 'data-level': String(a.level) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="hierarchy-item"]', contentElement: (el) => el.querySelector('[data-hi-box]') ?? el }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'hierarchy-item' }), ['div', { 'data-hi-box': '' }, 0]];
  },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface HierarchyAt { node: PMNode; pos: number; index: number }

function hierarchyAt($pos: ResolvedPos): HierarchyAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'hierarchy') continue;
    return { node: $pos.node(d), pos: $pos.before(d), index: d < $pos.depth ? $pos.index(d) : 0 };
  }
  return null;
}

const levelsOf = (node: PMNode) => { const out: number[] = []; node.forEach((c) => out.push(c.attrs.level as number)); return out; };
function itemPos(node: PMNode, pos: number, index: number): number {
  let p = pos + 1;
  for (let i = 0; i < index; i++) p += node.child(i).nodeSize;
  return p;
}
const itemEnd = (node: PMNode, pos: number, index: number) => itemPos(node, pos, index) + 1 + node.child(index).content.size;

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

// `\hierarchy`: replaces from..to (what was typed and the space before it) with a top item and two
// below it, the cursor in the top one.
export function insertHierarchy(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.hierarchy;
  if (!type) return null;
  const $start = state.doc.resolve(from);
  while (from > $start.start() && /\s/.test(state.doc.textBetween(from - 1, from))) from--;
  const node = type.create(null, DEFAULT_LEVELS.map((level) => state.schema.nodes.hierarchyItem.create({ level })));
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

export type HierarchySettings = Partial<{ variant: HierarchyVariant; colours: 'accent' | 'spectrum'; tiers: string[] }>;

export function setHierarchySettings(view: EditorView, pos: number, attrs: HierarchySettings): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'hierarchy') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

// Moves item `index` and everything under it `by` levels (+1 down a level, -1 up). Refused when the
// item would hang from nothing (deeper than one below the item before it) or go above the top.
export function shiftItem(state: EditorState, h: HierarchyAt, by: 1 | -1): Transaction | null {
  const levels = effectiveLevels(levelsOf(h.node));
  const level = levels[h.index];
  if (by === 1 && (h.index === 0 || level + 1 > levels[h.index - 1] + 1 || level >= MAX_LEVEL)) return null;
  if (by === -1 && level === 0) return null;
  const end = subtreeEnd(levels, h.index);
  const tr = state.tr;
  for (let i = h.index; i < end; i++) {
    const p = itemPos(h.node, h.pos, i);
    tr.setNodeMarkup(p, undefined, { ...h.node.child(i).attrs, level: Math.max(0, Math.min(MAX_LEVEL, levels[i] + by)) });
  }
  return tr;
}

// The item the selection is in, moved a level (the pill's buttons, on touch).
export function shiftCurrentItem(view: EditorView, by: 1 | -1): boolean {
  const h = hierarchyAt(view.state.selection.$from);
  const tr = h && shiftItem(view.state, h, by);
  if (!tr) return false;
  view.dispatch(tr);
  view.focus();
  return true;
}

export function hierarchyPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="hierarchy"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'hierarchy' ? pos : null;
  } catch { return null; }
}

// The level names: one input per level in use, in a popover from the pill or a tier label.
export function openTierEditor(view: EditorView, pos: number, anchor: DOMRect, focusLevel = 0): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'hierarchy') return;
  const L = LABELS.noteBlocks.hierarchy;
  const depth = Math.max(1, hierarchyLayout(levelsOf(node)).depth);
  const tiers = [...(node.attrs.tiers as string[])];
  openBlockPopover(anchor, (close) => {
    const form = document.createElement('form');
    const title = document.createElement('div');
    title.className = popoverClass.heading;
    title.textContent = L.levelsTitle;
    form.append(title);
    const inputs: HTMLInputElement[] = [];
    for (let i = 0; i < depth; i++) {
      const row = document.createElement('label');
      row.className = popoverClass.tierRow;
      const n = document.createElement('span');
      n.textContent = L.levelNumber(i + 1);
      const input = document.createElement('input');
      input.type = 'text';
      input.className = popoverClass.input;
      input.value = tiers[i] ?? '';
      input.placeholder = L.tierPlaceholders[i] ?? '';
      input.addEventListener('input', () => {
        const next = inputs.map((x) => x.value.trim());
        while (next.length && !next[next.length - 1]) next.pop();
        setHierarchySettings(view, pos, { tiers: next });
      });
      inputs.push(input);
      row.append(n, input);
      form.append(row);
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); close(); view.focus(); });
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); close(); view.focus(); } });
    setTimeout(() => inputs[Math.min(focusLevel, inputs.length - 1)]?.focus(), 0);
    return form;
  });
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export const hierarchyEnter: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  const h = hierarchyAt($from);
  if (!h || !$from.sameParent($to)) return !!h;
  const item = h.node.child(h.index);
  const levels = effectiveLevels(levelsOf(h.node));
  if (item.content.size === 0) {
    // Up a level first; at the top, out of the block (taking the empty item with it).
    const up = shiftItem(state, h, -1);
    if (up) { if (dispatch) dispatch(up.scrollIntoView()); return true; }
    if (!dispatch) return true;
    const tr = state.tr;
    let end = h.pos + h.node.nodeSize;
    if (h.node.childCount > 1) {
      const ip = itemPos(h.node, h.pos, h.index);
      tr.delete(ip, ip + item.nodeSize);
      end -= item.nodeSize;
    }
    tr.insert(end, state.schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
    return true;
  }
  if (!dispatch) return true;
  // A new item after this one: its first child if it has children, else its sibling. The text
  // after the cursor goes with it, as in a list.
  const hasChildren = h.index + 1 < levels.length && levels[h.index + 1] > levels[h.index];
  const level = levels[h.index] + (hasChildren ? 1 : 0);
  // At the end, with an empty item waiting next (a new block's): into it, at the new item's level.
  const atEnd = state.selection.empty && $from.parentOffset === item.content.size;
  const next = h.index + 1 < h.node.childCount ? h.node.child(h.index + 1) : null;
  if (atEnd && next && next.content.size === 0) {
    const np = itemPos(h.node, h.pos, h.index + 1);
    const tr = state.tr.setNodeMarkup(np, undefined, { ...next.attrs, level: Math.max(level, levels[h.index + 1]) });
    dispatch(tr.setSelection(TextSelection.create(tr.doc, np + 1)).scrollIntoView());
    return true;
  }
  const tr = state.tr.deleteSelection();
  const at = tr.selection.from;
  tr.split(at, 1, [{ type: state.schema.nodes.hierarchyItem, attrs: { level } }]);
  dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  return true;
};

export const hierarchyTab = (by: 1 | -1): Command => (state, dispatch) => {
  const h = hierarchyAt(state.selection.$from);
  if (!h) return false;
  const tr = shiftItem(state, h, by);
  if (tr && dispatch) dispatch(tr.scrollIntoView());
  return true;
};

export const hierarchyBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const h = hierarchyAt($from);
  if (!h) return false;
  const item = h.node.child(h.index);
  if (item.content.size === 0) {
    if (h.node.childCount === 1) {
      if (dispatch) {
        const tr = state.tr.replaceWith(h.pos, h.pos + h.node.nodeSize, state.schema.nodes.paragraph.create());
        dispatch(tr.setSelection(TextSelection.create(tr.doc, h.pos + 1)));
      }
      return true;
    }
    if (dispatch) {
      const ip = itemPos(h.node, h.pos, h.index);
      const tr = state.tr.delete(ip, ip + item.nodeSize);
      const target = h.index > 0 ? itemEnd(h.node, h.pos, h.index - 1) : h.pos + 2;
      dispatch(tr.setSelection(TextSelection.create(tr.doc, target)).scrollIntoView());
    }
    return true;
  }
  const up = shiftItem(state, h, -1);
  if (up) { if (dispatch) dispatch(up); return true; }
  // A top-level item joins the one before it, as in a list; the first one stays put.
  return h.index === 0;
};

export const hierarchyDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  const h = hierarchyAt($from);
  return !!h && h.index === h.node.childCount - 1;
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<HierarchyVariant, string> = {
  tree:    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.8" y="1.4" width="4.4" height="2.8" rx="0.7"/><path d="M8 4.2v2.3M3.6 8.8V6.5h8.8v2.3"/><rect x="1.6" y="8.8" width="4" height="2.6" rx="0.7"/><rect x="10.4" y="8.8" width="4" height="2.6" rx="0.7"/><path d="M3.6 11.4v1.6M12.4 11.4v1.6"/><circle cx="3.6" cy="14" r="0.9"/><circle cx="12.4" cy="14" r="0.9"/></svg>',
  columns: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.2" y="6.6" width="3.6" height="2.8" rx="0.7"/><path d="M4.8 8h1.6M6.4 3.6v8.8M6.4 3.6h1.4M6.4 12.4h1.4"/><rect x="7.8" y="2.2" width="3.4" height="2.8" rx="0.7"/><rect x="7.8" y="11" width="3.4" height="2.8" rx="0.7"/><path d="M11.2 3.6h1.6"/><circle cx="14" cy="3.6" r="0.9"/></svg>',
  outline: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5h6M3.5 2.5v4.5h2M3.5 7v4.5h2M7 11.5v2.5h2"/><path d="M7 7h7M7 11.5h7M10.5 14h3.5"/></svg>',
};

export const HIERARCHY_DESIGNS: BlockDesign<HierarchyVariant>[] = HIERARCHY_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.hierarchy.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.hierarchy;
  const C = LABELS.noteBlocks.cycle;
  const bar = blockPill('data-hierarchy-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const set = (a: HierarchySettings) => { const p = pos(); if (p !== null) setHierarchySettings(view, p, a); };
  const spectrum = attrs.colours === 'spectrum';
  const colours = pillButton(L.colourTitle(spectrum ? L.colours.spectrum : C.colours.accent), () => set({ colours: spectrum ? 'accent' : 'spectrum' }));
  colours.setAttribute('data-hi-tool', 'colours');
  colours.setAttribute('aria-pressed', String(spectrum));
  const levels = pillButton(L.levelsTitle, (e) => {
    const p = pos();
    if (p !== null) openTierEditor(view, p, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }, L.levels);
  levels.setAttribute('data-hi-tool', 'levels');
  const outdent = pillButton(L.outdent, () => { shiftCurrentItem(view, -1); }, '⇤');
  const indent = pillButton(L.indent, () => { shiftCurrentItem(view, 1); }, '⇥');
  outdent.setAttribute('data-hi-tool', 'shift');
  indent.setAttribute('data-hi-tool', 'shift');
  bar.append(designButtons(HIERARCHY_DESIGNS, attrs.variant as HierarchyVariant, (v) => set({ variant: v })), colours, levels, outdent, indent, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

// The level names, beside the rows (Tree) or over the columns (Columns): one grid item each, inside
// a display: contents wrapper. A click edits them.
function tiersWidget(view: EditorView, getPos: () => number | undefined, names: string[], placeholders: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.contentEditable = 'false';
  wrap.setAttribute('data-hi-tiers', '');
  names.forEach((name, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-hi-tier', '');
    b.style.setProperty('--level', String(i));
    if (i > 0) b.setAttribute('data-hi-tier-sub', '');
    b.title = LABELS.noteBlocks.hierarchy.levelsTitle;
    if (name) b.textContent = name;
    else if (placeholders) { b.textContent = LABELS.noteBlocks.hierarchy.levelNumber(i + 1); b.setAttribute('data-hi-unnamed', ''); }
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      const p = getPos();
      if (p !== undefined && view.editable) openTierEditor(view, p - 1, b.getBoundingClientRect(), i);
    });
    wrap.append(b);
  });
  return wrap;
}

const levelColor = (level: number) => `hsl(${Math.round((210 + level * 47) % 360)} 58% 50%)`;

function hierarchyDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.hierarchy;
  const current = hierarchyAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'hierarchy') return !node.isTextblock;
    const k = t++;
    const variant = node.attrs.variant as HierarchyVariant;
    const editing = current?.pos === pos;
    const spectrum = node.attrs.colours === 'spectrum';
    const { places, depth, leaves } = hierarchyLayout(levelsOf(node));
    const named = node.attrs.tiers as string[];
    const showTiers = named.some(Boolean) || editing;
    const names = Array.from({ length: depth }, (_, i) => named[i] ?? '');
    decos.push(Decoration.node(pos, pos + node.nodeSize, {
      style: `--hi-depth: ${depth}; --hi-leaves: ${leaves}`,
      ...(editing ? { 'data-hi-current': '' } : {}),
      ...(showTiers ? { 'data-hi-tiered': '' } : {}),
    }));
    const key = `${variant}-${node.attrs.colours}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node.attrs),
      { side: -1, key: `hierarchy-tools-${k}-${key}`, ignoreSelection: true, stopEvent: () => true }));
    if (showTiers && variant !== 'outline') {
      decos.push(Decoration.widget(pos + 1, (view, getPos) => tiersWidget(view, getPos, names, editing),
        { side: -1, key: `hierarchy-tiers-${k}-${names.join('|')}-${editing ? 'e' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    }
    node.forEach((item, offset, i) => {
      const ip = pos + 1 + offset;
      const p = places[i];
      const style = [`--level: ${p.level}`, `--start: ${p.start}`, `--end: ${p.end}`, `--since: ${p.sinceAbove}`];
      if (spectrum) style.push(`--item-color: ${levelColor(p.level)}`);
      const attrs: Record<string, string> = { style: style.join('; '), 'data-hi-sib': p.siblings };
      if (p.parent === null) attrs['data-hi-root'] = '';
      if (p.hasChildren) attrs['data-hi-parent'] = '';
      if (variant === 'outline' && showTiers) {
        const tier = names[p.level] || (editing ? L.levelNumber(p.level + 1) : '');
        if (tier) attrs['data-hi-tier-name'] = tier;
        // The name once per run of items at the same level, so a list of siblings reads cleanly.
        const prev = i > 0 ? places[i - 1].level : -1;
        if (prev === p.level) attrs['data-hi-tier-repeat'] = '';
      }
      // The placeholder goes in through a custom property, since it's drawn on the text's box.
      if (item.content.size === 0) {
        attrs['data-hi-empty'] = '';
        attrs.style += `; --hi-placeholder: ${JSON.stringify(i === 0 ? L.topPlaceholder : L.itemPlaceholder)}`;
      }
      decos.push(Decoration.node(ip, ip + item.nodeSize, attrs));
    });
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const hierarchyKey = new PluginKey('hierarchy');

// Keys and drawing, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const HierarchyBehaviour = Extension.create({
  name: 'hierarchyBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(hierarchyEnter),
      Tab: run(hierarchyTab(1)),
      'Shift-Tab': run(hierarchyTab(-1)),
      Backspace: run(hierarchyBackspace),
      Delete: run(hierarchyDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: hierarchyKey, props: { decorations: hierarchyDecorations } })];
  },
});

export const HierarchyExtensions = [Hierarchy, HierarchyItem, HierarchyBehaviour];
