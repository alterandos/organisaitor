import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, selectButton, type BlockDesign, replaceTypedWithBlock } from './blockDesigns';
import { iconSlot, type BlockIcon } from './blockIcons';

// The types of something (`\types`): a category and its kinds — the types of bird, of rock, of
// contract. An "is a kind of" relation, unlike the breakdown's "is part of" (asked for
// 2026-10-14): raptors are birds, they don't make up birds. One level only; deeper is the
// hierarchy block.
//
//   types          variant (design: guide / umbrella / isa / compact), frames
//   typesCategory  the category ("Birds")
//   typesItem      one type: icon / image attrs (the shared icon slot, blockIcons.ts), then
//   typesName / typesTrait / typesExample   its name, what sets it apart, an example
//
// Designs: Field guide (a card per type, like a field guide's plate; the default), Umbrella (an
// arched canopy named for the category, the types hanging beneath), "Is a" (the types joined to
// the category by a hollow-triangle arrow, the standard "is a kind of" notation), Compact (one
// line of chips). An empty example shows only while the block is being edited.
// Keys, as the breakdown's: Enter goes category → name → trait → example → the next type (a new
// one at the end); Enter in an empty type leaves the block (removing the type if another
// remains); Tab / Shift+Tab between types; Backspace steps back rather than merging.

export const TYPES_VARIANTS = ['guide', 'umbrella', 'isa', 'compact'] as const;
export type TypesVariant = typeof TYPES_VARIANTS[number];
const DEFAULT_ITEMS = 3;
const FIELDS = ['typesName', 'typesTrait', 'typesExample'] as const;

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const Types = Node.create({
  name: 'types',
  group: 'block',
  content: 'typesCategory typesItem+',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'guide', parseHTML: (el) => oneOf(TYPES_VARIANTS, el.getAttribute('data-variant'), 'guide'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="types"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'types', 'data-note-block': '' }), 0]; },
});

export const TypesCategory = Node.create({
  name: 'typesCategory',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-ty-category]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-ty-category': '' }), 0]; },
});

export const TypesItem = Node.create({
  name: 'typesItem',
  content: 'typesName typesTrait typesExample',
  defining: true,

  addAttributes() {
    return {
      icon:  { default: null, parseHTML: (el) => el.getAttribute('data-icon') || null, renderHTML: (a) => (a.icon ? { 'data-icon': a.icon } : {}) },
      image: { default: null, parseHTML: (el) => el.getAttribute('data-image') || null, renderHTML: (a) => (a.image ? { 'data-image': a.image } : {}) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="types-item"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'types-item' }), 0]; },
});

const fieldNode = (name: typeof FIELDS[number], attr: string) => Node.create({
  name,
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: `div[${attr}]`, priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { [attr]: '' }), 0]; },
});
export const TypesName = fieldNode('typesName', 'data-ty-name');
export const TypesTrait = fieldNode('typesTrait', 'data-ty-trait');
export const TypesExample = fieldNode('typesExample', 'data-ty-example');

// ── Positions ────────────────────────────────────────────────────────────────

interface TypesAt {
  node:  PMNode;
  pos:   number;
  index: number;    // which type (-1 in the category)
  field: number;    // which of its fields (0 name, 1 trait, 2 example; 0 in the category)
}

function typesAt($pos: ResolvedPos): TypesAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'types') continue;
    const child = d < $pos.depth ? $pos.index(d) : 0;
    const field = d + 1 < $pos.depth ? $pos.index(d + 1) : 0;
    return { node: $pos.node(d), pos: $pos.before(d), index: child - 1, field: child === 0 ? 0 : field };
  }
  return null;
}

const itemCount = (node: PMNode) => node.childCount - 1;
export function itemPos(node: PMNode, pos: number, index: number): number {
  let p = pos + 1;
  for (let i = 0; i < index + 1; i++) p += node.child(i).nodeSize;
  return p;
}
const isEmptyItem = (item: PMNode) => item.textContent.trim() === '';
const categoryEnd = (node: PMNode, pos: number) => pos + 2 + node.child(0).content.size;
// The end of field f of type i.
function fieldEnd(node: PMNode, pos: number, index: number, f: number): number {
  const item = node.child(index + 1);
  let p = itemPos(node, pos, index) + 1;
  for (let k = 0; k < f; k++) p += item.child(k).nodeSize;
  return p + 1 + item.child(f).content.size;
}

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making and changing ──────────────────────────────────────────────────────

const newItem = (state: EditorState) => state.schema.nodes.typesItem.create(null, FIELDS.map((f) => state.schema.nodes[f].create()));

// `\types`: replaces from..to (what was typed and the space before it) with a types block of three
// empty types, the cursor in the category.
export function insertTypes(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.types;
  if (!type) return null;
  const node = type.create(null, [state.schema.nodes.typesCategory.create(), ...Array.from({ length: DEFAULT_ITEMS }, () => newItem(state))]);
  const made = replaceTypedWithBlock(state, from, to, node);
  if (!made) return null;
  const { tr, at } = made;
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

export function setTypesVariant(view: EditorView, pos: number, variant: TypesVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'types') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

export function setTypeIcon(view: EditorView, pos: number, icon: BlockIcon): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'typesItem') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...icon }));
}

export function addType(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'types') return;
  const at = pos + node.nodeSize - 1;
  const tr = view.state.tr.insert(at, newItem(view.state));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

export const canDeleteType = (state: EditorState, pos: number) => {
  const parent = state.doc.resolve(pos).parent;
  return parent.type.name === 'types' && itemCount(parent) > 1;
};

export function deleteType(view: EditorView, pos: number): boolean {
  const item = view.state.doc.nodeAt(pos);
  if (item?.type.name !== 'typesItem' || !canDeleteType(view.state, pos)) return false;
  const tr = view.state.tr.delete(pos, pos + item.nodeSize);
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(pos), -1)).scrollIntoView());
  view.focus();
  return true;
}

export function typesPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="types"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'types' ? pos : null;
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

function caretTo(state: EditorState, pos: number, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  return true;
}

function leave(state: EditorState, t: TypesAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const tr = state.tr;
  let end = t.pos + t.node.nodeSize;
  if (itemCount(t.node) > 1) {
    const ip = itemPos(t.node, t.pos, t.index);
    const size = t.node.child(t.index + 1).nodeSize;
    tr.delete(ip, ip + size);
    end -= size;
  }
  tr.insert(end, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  return true;
}

export const typesEnter: Command = (state, dispatch) => {
  const t = typesAt(state.selection.$from);
  if (!t) return false;
  if (t.index < 0) return caretTo(state, fieldEnd(t.node, t.pos, 0, 0), dispatch);
  const item = t.node.child(t.index + 1);
  if (isEmptyItem(item)) return leave(state, t, dispatch);
  if (t.field < FIELDS.length - 1) return caretTo(state, fieldEnd(t.node, t.pos, t.index, t.field + 1), dispatch);
  if (t.index + 1 < itemCount(t.node) && isEmptyItem(t.node.child(t.index + 2))) return caretTo(state, fieldEnd(t.node, t.pos, t.index + 1, 0), dispatch);
  if (dispatch) {
    const at = itemPos(t.node, t.pos, t.index) + item.nodeSize;
    const tr = state.tr.insert(at, newItem(state));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  }
  return true;
};

export const typesTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const t = typesAt(state.selection.$from);
  if (!t) return false;
  const next = t.index + dir;
  if (next < 0) return caretTo(state, categoryEnd(t.node, t.pos), dispatch);
  if (next >= itemCount(t.node)) return true;
  return caretTo(state, fieldEnd(t.node, t.pos, next, 0), dispatch);
};

export const typesBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const t = typesAt($from);
  if (!t) return false;
  if (t.index < 0) {
    if (t.node.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, t.pos + 1)));
    }
    return true;
  }
  if (t.field > 0) return caretTo(state, fieldEnd(t.node, t.pos, t.index, t.field - 1), dispatch);
  const item = t.node.child(t.index + 1);
  const prevEnd = t.index === 0 ? categoryEnd(t.node, t.pos) : fieldEnd(t.node, t.pos, t.index - 1, FIELDS.length - 1);
  if (isEmptyItem(item) && itemCount(t.node) > 1) {
    if (dispatch) {
      const ip = itemPos(t.node, t.pos, t.index);
      const tr = state.tr.delete(ip, ip + item.nodeSize);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, prevEnd)).scrollIntoView());
    }
    return true;
  }
  return caretTo(state, prevEnd, dispatch);
};

export const typesDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!typesAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

function deleteWidget(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-ty-delete', '');
  b.title = LABELS.noteBlocks.types.deleteType;
  b.setAttribute('aria-label', LABELS.noteBlocks.types.deleteType);
  b.textContent = '×';
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p !== undefined && view.editable) deleteType(view, view.state.doc.resolve(p).before());
  });
  return b;
}

const DESIGN_ICONS: Record<TypesVariant, string> = {
  guide:    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5h7"/><rect x="1.5" y="5" width="3.6" height="8.5" rx="1"/><rect x="6.2" y="5" width="3.6" height="8.5" rx="1"/><rect x="10.9" y="5" width="3.6" height="8.5" rx="1"/></svg>',
  umbrella: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 7a6.5 5 0 0 1 13 0Z"/><path d="M3.5 7v3M8 7v3M12.5 7v3"/><rect x="1.8" y="10.5" width="3.4" height="3" rx="1.5"/><rect x="6.3" y="10.5" width="3.4" height="3" rx="1.5"/><rect x="10.8" y="10.5" width="3.4" height="3" rx="1.5"/></svg>',
  isa:      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="6" width="4" height="4" rx="0.8"/><path d="M5 8l2.2-1.6v3.2Z"/><path d="M7.2 8H9M9 3v10M9 3h2.5M9 8h2.5M9 13h2.5"/><circle cx="13" cy="3" r="1.2"/><circle cx="13" cy="8" r="1.2"/><circle cx="13" cy="13" r="1.2"/></svg>',
  compact:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8h3"/><rect x="5.5" y="6" width="3.2" height="4" rx="2"/><rect x="9.5" y="6" width="2.5" height="4" rx="2"/><rect x="12.8" y="6" width="2" height="4" rx="1.6"/></svg>',
};

export const TYPES_DESIGNS: BlockDesign<TypesVariant>[] = TYPES_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.types.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.types;
  const bar = blockPill('data-types-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const add = pillButton(L.addType, () => { const p = pos(); if (p !== null) addType(view, p); }, `+ ${L.addTypeShort}`);
  bar.append(designButtons(TYPES_DESIGNS, attrs.variant as TypesVariant, (v) => { const p = pos(); if (p !== null) setTypesVariant(view, p, v); }), add, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

function typesDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.types;
  const current = typesAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'types') return !node.isTextblock;
    const k = t++;
    const n = itemCount(node);
    const variant = node.attrs.variant as TypesVariant;
    const editing = current?.pos === pos;
    decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `--ty-n: ${n}`, ...(editing ? { 'data-ty-current': '' } : {}) }));
    const key = `${variant}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node.attrs),
      { side: -1, key: `types-tools-${k}-${key}`, ignoreSelection: true, stopEvent: () => true }));
    const category = node.child(0);
    decos.push(Decoration.node(pos + 1, pos + 1 + category.nodeSize, category.content.size === 0
      ? { 'data-ty-empty': '', 'data-ty-placeholder': L.categoryPlaceholder }
      : { 'data-ty-suffix': L.kindsOf }));
    node.forEach((item, offset, ci) => {
      if (ci === 0) return;
      const i = ci - 1;
      const ip = pos + 1 + offset;
      const itemAttrs: Record<string, string> = { style: `--i: ${i}` };
      if (i === 0) itemAttrs['data-ty-first'] = '';
      if (i === n - 1) itemAttrs['data-ty-last'] = '';
      // Compact shows names only: what sets each apart is its hover title (and shows while editing).
      if (variant === 'compact' && item.child(1).textContent) itemAttrs.title = item.child(1).textContent;
      decos.push(Decoration.node(ip, ip + item.nodeSize, itemAttrs));
      const { icon, image } = item.attrs as BlockIcon;
      decos.push(Decoration.widget(ip + 1, (view, getPos) => iconSlot({
        icon, image, attr: 'data-ty-icon',
        partPos: () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; },
        set: (p, v) => setTypeIcon(view, p, v),
      }, () => view.focus()), { side: -1, key: `types-icon-${k}-${i}-${icon ?? ''}-${image ? image.length : 0}`, ignoreSelection: true, stopEvent: () => true }));
      if (n > 1) {
        decos.push(Decoration.widget(ip + item.nodeSize - 1, (view, getPos) => deleteWidget(view, getPos),
          { side: 1, key: `types-delete-${k}-${i}`, ignoreSelection: true, stopEvent: () => true }));
      }
      let fp = ip + 1;
      item.forEach((field, _o, f) => {
        if (field.content.size === 0) {
          const placeholder = [L.namePlaceholder, L.traitPlaceholder, L.examplePlaceholder][f];
          // The name always shows; an empty trait or example only while the block is being edited.
          decos.push(Decoration.node(fp, fp + field.nodeSize, f === 0 || editing
            ? { 'data-ty-empty': '', 'data-ty-placeholder': placeholder }
            : { 'data-ty-hide': '' }));
        }
        fp += field.nodeSize;
      });
    });
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const typesKey = new PluginKey('types');

// Keys and drawing, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const TypesBehaviour = Extension.create({
  name: 'typesBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(typesEnter),
      Tab: run(typesTab(1)),
      'Shift-Tab': run(typesTab(-1)),
      Backspace: run(typesBackspace),
      Delete: run(typesDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: typesKey, props: { decorations: typesDecorations } })];
  },
});

export const TypesExtensions = [Types, TypesCategory, TypesItem, TypesName, TypesTrait, TypesExample, TypesBehaviour];
