import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { NoteEditorMenuApi } from '../contextMenu';
import { blockFrameAttributes, blockPill, designButtons, designMenuItem, frameButtons, frameMenuItem, pillButton, replaceTypedWithBlock, selectButton, type BlockDesign } from './blockDesigns';
import { SET_IDS, regionOf, vennLayout, type SetId } from './vennLayout';

// A Venn diagram in a note (`\venn`, asked for by the user 2026-10-23): two or three sets and the
// things that belong to one, some or all of them (or none).
//
//   vennBlock  variant: 'circles' (the overlapping circles, each thing in its region) | 'table' (a
//              row per thing, a tick per set: clearer once there are many)
//   vennSet    a set's name; sid: 'a' | 'b' | 'c'
//   vennItem   one thing; sets: the sids it's in
//
// Circles is the familiar diagram for a handful of things; Table reads better past about a dozen
// (the usual advice: a diagram for a few, a matrix for many). The same content, so switching is
// free. Which sets a thing is in: the set buttons beside it while it's being edited (or on hover),
// or right-click. Keys: Enter adds the next thing (in the same sets), an empty one leaves; Tab /
// Shift+Tab move between parts; Backspace on an empty thing removes it.

export const VENN_VARIANTS = ['circles', 'table'] as const;
export type VennVariant = typeof VENN_VARIANTS[number];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
const setsOf = (v: unknown): SetId[] => (Array.isArray(v) ? SET_IDS.filter((s) => v.includes(s)) : []);

export const VennBlock = Node.create({
  name: 'vennBlock',
  group: 'block',
  content: 'vennSet vennSet vennSet? vennItem*',
  defining: true,
  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'circles', parseHTML: (el) => oneOf(VENN_VARIANTS, el.getAttribute('data-variant'), 'circles'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="venn"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'venn', 'data-note-block': '' }), 0]; },
});

export const VennSet = Node.create({
  name: 'vennSet',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { sid: { default: 'a', parseHTML: (el) => oneOf(SET_IDS, el.getAttribute('data-sid'), 'a'), renderHTML: (a) => ({ 'data-sid': a.sid }) } };
  },
  parseHTML() { return [{ tag: 'div[data-venn-set]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-venn-set': '' }), 0]; },
});

export const VennItem = Node.create({
  name: 'vennItem',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      sets: {
        default: [],
        parseHTML: (el) => setsOf((el.getAttribute('data-sets') ?? '').split(' ')),
        renderHTML: (a) => ({ 'data-sets': setsOf(a.sets).join(' ') }),
      },
    };
  },
  parseHTML() { return [{ tag: 'div[data-venn-item]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-venn-item': '' }), 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface VennAt { node: PMNode; pos: number; part: number }

function vennAt($pos: ResolvedPos): VennAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'vennBlock') continue;
    return { node: $pos.node(d), pos: $pos.before(d), part: d < $pos.depth ? $pos.index(d) : 0 };
  }
  return null;
}

const partStart = (node: PMNode, pos: number, index: number) => {
  let p = pos + 1;
  for (let i = 0; i < index; i++) p += node.child(i).nodeSize;
  return p;
};
export const setCount = (node: PMNode): 2 | 3 => {
  let n = 0;
  node.forEach((c) => { if (c.type.name === 'vennSet') n++; });
  return n === 3 ? 3 : 2;
};

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

export function vennNode(state: EditorState, names: string[] = ['', '']): PMNode {
  const { vennBlock, vennSet } = state.schema.nodes;
  return vennBlock.create(null, names.slice(0, 3).map((name, i) => vennSet.create({ sid: SET_IDS[i] }, name ? state.schema.text(name) : null)));
}

// `\venn`: two sets, the cursor in the first's name.
export function insertVenn(state: EditorState, from: number, to: number): Transaction | null {
  if (!state.schema.nodes.vennBlock) return null;
  const made = replaceTypedWithBlock(state, from, to, vennNode(state));
  if (!made) return null;
  return made.tr.setSelection(TextSelection.create(made.tr.doc, made.at + 2)).scrollIntoView();
}

export function setVennVariant(view: EditorView, pos: number, variant: VennVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'vennBlock') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

// Two sets ⇄ three. Taking the third away takes it off every thing that was in it.
export function toggleThirdSet(view: EditorView, pos: number): void {
  const state = view.state;
  const node = state.doc.nodeAt(pos);
  if (node?.type.name !== 'vennBlock') return;
  const tr = state.tr;
  if (setCount(node) === 2) {
    const at = partStart(node, pos, 2);
    tr.insert(at, state.schema.nodes.vennSet.create({ sid: 'c' }));
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
    view.focus();
    return;
  }
  node.forEach((child, offset) => {
    if (child.type.name === 'vennItem' && setsOf(child.attrs.sets).includes('c')) tr.setNodeAttribute(pos + 1 + offset, 'sets', setsOf(child.attrs.sets).filter((s) => s !== 'c'));
  });
  const third = partStart(node, pos, 2);
  tr.delete(tr.mapping.map(third), tr.mapping.map(third + node.child(2).nodeSize));
  view.dispatch(tr);
}

export function toggleItemSet(view: EditorView, itemPos: number, sid: SetId): void {
  const item = view.state.doc.nodeAt(itemPos);
  if (item?.type.name !== 'vennItem') return;
  const sets = setsOf(item.attrs.sets);
  view.dispatch(view.state.tr.setNodeAttribute(itemPos, 'sets', sets.includes(sid) ? sets.filter((s) => s !== sid) : [...sets, sid]));
}

// A new thing at the end, in `sets`, the cursor in it.
export function addVennItem(view: EditorView, pos: number, sets: SetId[] = ['a']): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'vennBlock') return;
  const at = pos + node.nodeSize - 1;
  const tr = view.state.tr.insert(at, view.state.schema.nodes.vennItem.create({ sets }));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
  view.focus();
}

export function vennPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="venn"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'vennBlock' ? pos : null;
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const go = (state: EditorState, to: number, dispatch?: (tr: Transaction) => void, tr = state.tr) => {
  if (dispatch) dispatch(tr.setSelection(TextSelection.create(tr.doc, to)).scrollIntoView());
  return true;
};
const endOf = (doc: PMNode, start: number) => start + 1 + doc.nodeAt(start)!.content.size;

export const vennEnter: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  const v = vennAt($from);
  if (!v || !$from.parent.isTextblock || !$from.sameParent($to)) return false;
  const child = v.node.child(v.part);
  const nSets = setCount(v.node);
  if (child.type.name === 'vennSet') {
    if (v.part + 1 < v.node.childCount) return go(state, endOf(state.doc, partStart(v.node, v.pos, v.part + 1)), dispatch);
    const at = v.pos + v.node.nodeSize - 1;
    return go(state, at + 1, dispatch, state.tr.insert(at, state.schema.nodes.vennItem.create({ sets: ['a'] })));
  }
  const start = partStart(v.node, v.pos, v.part);
  if (child.content.size === 0) {
    const tr = state.tr.delete(start, start + child.nodeSize);
    const after = tr.mapping.map(v.pos + v.node.nodeSize);
    tr.insert(after, state.schema.nodes.paragraph.create());
    return go(state, after + 1, dispatch, tr);
  }
  if (dispatch) dispatch(state.tr.split($from.pos, 1, [{ type: state.schema.nodes.vennItem, attrs: { sets: setsOf(child.attrs.sets).filter((s) => SET_IDS.indexOf(s) < nSets) } }]).scrollIntoView());
  return true;
};

const vennTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const v = vennAt(state.selection.$from);
  if (!v) return false;
  const next = v.part + dir;
  if (next < 0 || next >= v.node.childCount) return true;
  return go(state, endOf(state.doc, partStart(v.node, v.pos, next)), dispatch);
};

export const vennBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const v = vennAt($from);
  if (!v) return false;
  if (v.part === 0) {
    if (v.node.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(v.pos, v.pos + v.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, v.pos + 1)));
    }
    return true;
  }
  const child = v.node.child(v.part);
  const prevEnd = endOf(state.doc, partStart(v.node, v.pos, v.part - 1));
  if (child.type.name === 'vennItem' && child.content.size === 0) {
    const start = partStart(v.node, v.pos, v.part);
    return go(state, prevEnd, dispatch, state.tr.delete(start, start + child.nodeSize));
  }
  return go(state, prevEnd, dispatch);
};

const vennDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!vennAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const setNames = (node: PMNode): Record<SetId, string> => {
  const out = { a: '', b: '', c: '' } as Record<SetId, string>;
  node.forEach((c) => { if (c.type.name === 'vennSet') out[c.attrs.sid as SetId] = c.textContent.trim(); });
  return out;
};

function vennDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.venn;
  const sel = vennAt(state.selection.$from);
  let n = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'vennBlock') return !node.isTextblock;
    const t = n++;
    const variant = node.attrs.variant as VennVariant;
    const nSets = setCount(node);
    const names = setNames(node);
    const editing = sel?.pos === pos;
    const itemSets: SetId[][] = [];
    node.forEach((c) => { if (c.type.name === 'vennItem') itemSets.push(setsOf(c.attrs.sets).filter((s) => SET_IDS.indexOf(s) < nSets)); });
    const layout = vennLayout(nSets, itemSets);

    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, variant, nSets, node.attrs),
      { side: -1, key: `venn-tools-${t}-${variant}-${nSets}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    if (variant === 'circles') {
      decos.push(Decoration.widget(pos + 1, () => circlesWidget(layout), { side: -2, key: `venn-circles-${t}-${nSets}-${layout.h}`, ignoreSelection: true }));
    }
    const blockAttrs: Record<string, string> = { 'data-venn-n': String(nSets), style: `--venn-ratio: ${layout.w} / ${layout.h}; --venn-cols: ${nSets}` };
    if (editing) blockAttrs['data-venn-current'] = '';
    decos.push(Decoration.node(pos, pos + node.nodeSize, blockAttrs));

    let p = pos + 1;
    let k = 0;
    node.forEach((child, _o, i) => {
      const end = p + child.nodeSize;
      const empty = child.content.size === 0;
      if (child.type.name === 'vennSet') {
        const sid = child.attrs.sid as SetId;
        const at = layout.labels.find((l) => l.id === sid);
        const attrs: Record<string, string> = { style: at ? `--x: ${at.x}%; --y: ${at.y}%; --col: ${SET_IDS.indexOf(sid) + 2}` : '' };
        if (empty) { attrs['data-venn-empty'] = ''; attrs['data-venn-placeholder'] = L.setPlaceholder(i + 1); }
        decos.push(Decoration.node(p, end, attrs));
      } else {
        const at = layout.items[k];
        const sets = itemSets[k];
        const current = editing && sel!.part === i;
        const attrs: Record<string, string> = { style: `--x: ${at.x}%; --y: ${at.y}%`, 'data-venn-region': regionOf(sets, nSets) || 'none' };
        if (empty) { attrs['data-venn-empty'] = ''; attrs['data-venn-placeholder'] = L.itemPlaceholder; }
        if (current) attrs['data-venn-editing'] = '';
        decos.push(Decoration.node(p, end, attrs));
        decos.push(Decoration.widget(end - 1, (view, getPos) => setButtons(view, getPos, nSets, sets, names), { side: 1, key: `venn-sets-${t}-${i}-${sets.join('')}-${nSets}-${SET_IDS.map((s) => names[s]).join('|')}`, ignoreSelection: true, stopEvent: () => true }));
        k++;
      }
      p = end;
    });
    decos.push(Decoration.widget(pos + node.nodeSize - 1, (view, getPos) => addButton(view, getPos), { side: 3, key: `venn-add-${t}`, ignoreSelection: true, stopEvent: () => true }));
    return false;
  });
  return n ? DecorationSet.create(state.doc, decos) : null;
}

function circlesWidget(layout: ReturnType<typeof vennLayout>): HTMLElement {
  const NS = 'http://www.w3.org/2000/svg';
  const holder = document.createElement('div');
  holder.setAttribute('data-venn-canvas', '');
  holder.setAttribute('aria-hidden', 'true');
  holder.contentEditable = 'false';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${layout.w} ${layout.h}`);
  for (const c of layout.circles) {
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', String(c.cx));
    circle.setAttribute('cy', String(c.cy));
    circle.setAttribute('r', String(c.r));
    circle.setAttribute('data-sid', c.id);
    svg.append(circle);
  }
  holder.append(svg);
  return holder;
}

// The set buttons beside a thing: one per set, pressed when it's in that set.
function setButtons(view: EditorView, getPos: () => number | undefined, nSets: number, sets: SetId[], names: Record<SetId, string>): HTMLElement {
  const L = LABELS.noteBlocks.venn;
  const box = document.createElement('span');
  box.setAttribute('data-venn-sets', '');
  box.contentEditable = 'false';
  SET_IDS.slice(0, nSets).forEach((sid, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-sid', sid);
    const name = names[sid] || L.setName(i + 1);
    b.textContent = name.length > 8 ? `${name.slice(0, 7)}…` : name;
    b.setAttribute('aria-pressed', String(sets.includes(sid)));
    b.title = L.inSet(name);
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const at = getPos();
      if (at === undefined || !view.editable) return;
      const $at = view.state.doc.resolve(at);
      for (let d = $at.depth; d > 0; d--) if ($at.node(d).type.name === 'vennItem') { toggleItemSet(view, $at.before(d), sid); return; }
    });
    box.append(b);
  });
  return box;
}

function addButton(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('data-venn-add', '');
  b.contentEditable = 'false';
  b.textContent = LABELS.noteBlocks.venn.addItem;
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!view.editable || getPos() === undefined) return;
    const block = vennPosAt(view, b);
    if (block !== null) addVennItem(view, block);
  });
  return b;
}

const DESIGN_ICONS: Record<VennVariant, string> = {
  circles: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="8" r="4.5"/><circle cx="10" cy="8" r="4.5"/></svg>',
  table:   '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 6h13M1.5 9.5h13M8 2.5v11M11.5 2.5v11"/></svg>',
};
export const VENN_DESIGNS: BlockDesign<VennVariant>[] = VENN_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.venn.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, variant: VennVariant, nSets: number, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.venn;
  const bar = blockPill('data-venn-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const third = pillButton(nSets === 3 ? L.twoSets : L.threeSets, () => { const p = pos(); if (p !== null) toggleThirdSet(view, p); }, nSets === 3 ? '2' : '3');
  third.setAttribute('aria-pressed', String(nSets === 3));
  bar.append(designButtons(VENN_DESIGNS, variant, (v) => { const p = pos(); if (p !== null) setVennVariant(view, p, v); }), third, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

const vennKey = new PluginKey('vennBlock');

export const VennBehaviour = Extension.create({
  name: 'vennBehaviour',
  priority: 110,
  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return { Enter: run(vennEnter), Tab: run(vennTab(1)), 'Shift-Tab': run(vennTab(-1)), Backspace: run(vennBackspace), Delete: run(vennDelete) };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ key: vennKey, props: { decorations: vennDecorations } })];
  },
});

export const VennExtensions = [VennBlock, VennSet, VennItem, VennBehaviour];

// Right-click on a Venn diagram: on a thing, which sets it's in (ticks: the keyboard way); then the
// design, two or three sets, and the frame.
registerContextMenuProvider({
  id: 'note-editor.venn',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="venn"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = vennPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.venn;
    const nSets = setCount(node);
    const names = setNames(node);
    const out = [];
    const itemEl = ctx.target.closest('[data-venn-item]');
    if (itemEl) {
      let itemPos = -1;
      try { itemPos = view.posAtDOM(itemEl, 0) - 1; } catch { itemPos = -1; }
      const item = itemPos >= 0 ? view.state.doc.nodeAt(itemPos) : null;
      if (item?.type.name === 'vennItem') {
        const sets = setsOf(item.attrs.sets);
        out.push({ id: 'venn-in', label: L.inMenu, submenu: [SET_IDS.slice(0, nSets).map((sid, i) => ({
          id: sid, label: names[sid] || L.setName(i + 1), icon: sets.includes(sid) ? '✓' : undefined, run: () => toggleItemSet(view, itemPos, sid),
        }))] });
      }
    }
    out.push(
      designMenuItem(VENN_DESIGNS, node.attrs.variant as VennVariant, (v) => setVennVariant(view, pos, v)),
      { id: 'venn-third', label: nSets === 3 ? L.twoSets : L.threeSets, run: () => toggleThirdSet(view, pos) },
      frameMenuItem(view, pos, node.attrs),
    );
    return out;
  },
});
