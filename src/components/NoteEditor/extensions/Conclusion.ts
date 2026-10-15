import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { Fragment, type Node as PMNode, type ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, selectButton, type BlockDesign, placeBlock, replaceTypedWithBlock } from './blockDesigns';

// A conclusion in a note (`\conclusion`, or Conclusion on selected text): a line that says "this
// follows from what came before", with, optionally, the reasons that lead to it written in it.
// Note-taking structure only, like the quote (extensions/Quote.ts).
//
//   conclusion        variant attr: how it's drawn (CONCLUSION_VARIANTS)
//   conclusionReason  a reason that leads to it (none or more, above the conclusion)
//   conclusionText    the conclusion itself (Shift+Enter is a line break)
//
// Designs (asked for 2026-10-14/15), each drawing the reasons as feeding the conclusion: Arrow (a
// rail down from what's above, or from each reason, turning to point at the text); Brace (a
// horizontal } gathering what's above into the text); Therefore (∵ before each reason, ∴ before
// the conclusion); Total line (the reasons like figures, a double rule, the result); Funnel (the
// reasons as bands of a funnel narrowing to the conclusion at its spout).
// Keys: Enter in a reason starts the next one, and on an empty reason goes on to the conclusion;
// Enter in the conclusion leaves the block (an empty block turns back into a paragraph); Tab /
// Shift+Tab move between the parts; Backspace at a part's start steps back rather than merging,
// and at the start of a conclusion with no reasons turns it back into a paragraph.

export const CONCLUSION_VARIANTS = ['arrow', 'brace', 'therefore', 'total', 'funnel'] as const;
export type ConclusionVariant = typeof CONCLUSION_VARIANTS[number];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const ConclusionBlock = Node.create({
  name: 'conclusion',
  group: 'block',
  content: 'conclusionReason* conclusionText',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: {
        default: 'arrow' satisfies ConclusionVariant,
        parseHTML: (el) => oneOf(CONCLUSION_VARIANTS, el.getAttribute('data-variant'), 'arrow'),
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="conclusion"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'conclusion', 'data-note-block': '' }), 0];
  },
});

export const ConclusionReason = Node.create({
  name: 'conclusionReason',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-cc-reason]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-cc-reason': '' }), 0];
  },
});

export const ConclusionText = Node.create({
  name: 'conclusionText',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-cc-text]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-cc-text': '' }), 0];
  },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface ConclusionAt {
  node:      PMNode;
  pos:       number;    // the conclusion's position
  partIndex: number;    // which child the position is in (the conclusion text is the last)
}

function conclusionAt($pos: ResolvedPos): ConclusionAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'conclusion') continue;
    const node = $pos.node(d);
    return { node, pos: $pos.before(d), partIndex: d < $pos.depth ? $pos.index(d) : node.childCount - 1 };
  }
  return null;
}

const partStart = (c: { node: PMNode; pos: number }, index: number) => {
  let p = c.pos + 1;
  for (let i = 0; i < index; i++) p += c.node.child(i).nodeSize;
  return p;
};

export function conclusionPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="conclusion"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'conclusion' ? pos : null;
  } catch { return null; }
}

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making one ───────────────────────────────────────────────────────────────

function conclusionNode(state: EditorState, text: Fragment | null = null, reasons: Fragment[] = []): PMNode {
  const { conclusion, conclusionReason, conclusionText } = state.schema.nodes;
  return conclusion.create(null, [...reasons.map((r) => conclusionReason.create(null, r)), conclusionText.create(null, text)]);
}

// `\conclusion`: replaces from..to (what was typed, and the space before it) with an empty
// conclusion, the cursor in it.
export function insertConclusion(state: EditorState, from: number, to: number): Transaction | null {
  if (!state.schema.nodes.conclusion) return null;
  const made = replaceTypedWithBlock(state, from, to, conclusionNode(state));
  if (!made) return null;
  const { tr, at } = made;
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

// Conclusion on selected text (the selection menu), formatting kept: one line becomes the
// conclusion; several lines become reasons, the last of them the conclusion they lead to.
export function conclusionFromSelection(view: EditorView, from: number, to: number): void {
  const state = view.state;
  if (!state.schema.nodes.conclusion) return;
  const lines: Fragment[] = [];
  state.doc.nodesBetween(from, to, (n, p) => {
    if (!n.isTextblock) return true;
    const s = Math.max(from, p + 1) - (p + 1);
    const e = Math.min(to, p + 1 + n.content.size) - (p + 1);
    const part = n.content.cut(Math.max(0, s), Math.max(0, e));
    if (part.textBetween(0, part.size).trim()) lines.push(part);
    return false;
  });
  if (lines.length === 0) return;
  const tr = state.tr.delete(from, to);
  const node = conclusionNode(state, lines[lines.length - 1], lines.slice(0, -1));
  const at = placeBlock(tr, tr.mapping.map(from), node);
  if (at === null) return;
  const textStart = partStart({ node, pos: at }, node.childCount - 1);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, textStart + 1 + node.lastChild!.content.size)).scrollIntoView());
  view.focus();
}

export function setConclusionVariant(view: EditorView, pos: number, variant: ConclusionVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'conclusion') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

// A new, empty reason after the others (just above the conclusion), the cursor in it.
export function addReason(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'conclusion') return;
  const at = partStart({ node, pos }, node.childCount - 1);
  const tr = view.state.tr.insert(at, view.state.schema.nodes.conclusionReason.create());
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
  view.focus();
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const isText = (c: ConclusionAt) => c.partIndex === c.node.childCount - 1;

// Back to a plain paragraph with the conclusion's text, the cursor where it was.
function unwrap(state: EditorState, c: ConclusionAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const offset = state.selection.from - (partStart(c, c.partIndex) + 1);
  const para = state.schema.nodes.paragraph.create(null, c.node.lastChild!.content);
  const tr = state.tr.replaceWith(c.pos, c.pos + c.node.nodeSize, para);
  dispatch(tr.setSelection(TextSelection.create(tr.doc, c.pos + 1 + Math.max(0, offset))).scrollIntoView());
  return true;
}

function toPart(state: EditorState, c: ConclusionAt, index: number, end: boolean, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) {
    const start = partStart(c, index);
    const pos = end ? start + 1 + c.node.child(index).content.size : start + 1;
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  }
  return true;
}

export const conclusionEnter: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const c = conclusionAt($from);
  if (!c || !$from.parent.isTextblock) return false;
  const part = c.node.child(c.partIndex);
  if (!isText(c)) {
    if (!dispatch) return true;
    const start = partStart(c, c.partIndex);
    if (part.content.size === 0) {
      // An empty reason: done with reasons, on to the conclusion.
      const tr = state.tr.delete(start, start + part.nodeSize);
      const after = conclusionAt(tr.doc.resolve(c.pos + 1))!;
      const textStart = partStart(after, after.node.childCount - 1);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, textStart + 1 + after.node.lastChild!.content.size)).scrollIntoView());
      return true;
    }
    const at = start + part.nodeSize;
    const tr = state.tr.insert(at, state.schema.nodes.conclusionReason.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
    return true;
  }
  if (c.node.textContent.trim() === '') return unwrap(state, c, dispatch);
  if (dispatch) {
    const after = c.pos + c.node.nodeSize;
    const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  }
  return true;
};

export const conclusionTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const c = conclusionAt(state.selection.$from);
  if (!c) return false;
  const next = c.partIndex + dir;
  if (next < 0 || next >= c.node.childCount) return true;
  return toPart(state, c, next, true, dispatch);
};

export const conclusionBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const c = conclusionAt($from);
  if (!c) return false;
  if (isText(c) && c.node.childCount === 1) return unwrap(state, c, dispatch);
  const part = c.node.child(c.partIndex);
  if (!isText(c) && part.content.size === 0) {
    // An empty reason goes; the cursor to the end of the part before it (or the start of the next).
    if (dispatch) {
      const start = partStart(c, c.partIndex);
      const tr = state.tr.delete(start, start + part.nodeSize);
      const target = c.partIndex > 0 ? start - 1 : start + 1;
      dispatch(tr.setSelection(TextSelection.create(tr.doc, target)).scrollIntoView());
    }
    return true;
  }
  if (c.partIndex === 0) return true;
  return toPart(state, c, c.partIndex - 1, true, dispatch);
};

export const conclusionDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!conclusionAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<ConclusionVariant, string> = {
  arrow:     '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5v7.5h6"/><path d="M8 6.5l2.5 2.5L8 11.5"/><path d="M12 9h2.5"/></svg>',
  brace:     '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5c0 1.5 1 2 2.5 2h2.5c1 0 1.5.6 2 1.5.5-.9 1-1.5 2-1.5H12c1.5 0 2.5-.5 2.5-2"/><path d="M3 11h10M4.5 14h7"/></svg>',
  therefore: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="4" r="1.3"/><circle cx="1.8" cy="8" r="1.3"/><circle cx="6.2" cy="8" r="1.3"/><path d="M9 6h5.5M9 9.5h4"/></svg>',
  total:     '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2.5h9M7 5h7"/><path d="M1.5 8h13M1.5 9.8h13"/><path d="M5 13h9"/></svg>',
  funnel:    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 2h13l-4.5 7v4.5l-4 1.5V9Z"/></svg>',
};

export const CONCLUSION_DESIGNS: BlockDesign<ConclusionVariant>[] = CONCLUSION_VARIANTS.map((id) => ({
  id, label: LABELS.noteBlocks.conclusion.styles[id], icon: DESIGN_ICONS[id],
}));

// The funnel's band for reason i of n: its width at the top and bottom edges, narrowing from the
// full width to the spout (the conclusion's width).
export function funnelBand(i: number, n: number): { top: number; bottom: number } {
  const spout = 0.42;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { top: r(1 - ((1 - spout) * i) / n), bottom: r(1 - ((1 - spout) * (i + 1)) / n) };
}

// The brace over the text: two curls and a point, joined by lines that stretch (so it stays crisp
// at any width, unlike a stretched glyph).
function braceWidget(): HTMLElement {
  const el = document.createElement('span');
  el.setAttribute('data-cc-brace', '');
  el.setAttribute('aria-hidden', 'true');
  el.contentEditable = 'false';
  el.innerHTML =
    '<svg data-cc-curl viewBox="0 0 12 12"><path d="M1 1c0 4 2 6 6 6h5"/></svg><i></i>'
    + '<svg data-cc-point viewBox="0 0 16 12"><path d="M0 7h3c3 0 4 1.5 5 4.5 1-3 2-4.5 5-4.5h3"/></svg><i></i>'
    + '<svg data-cc-curl data-cc-right viewBox="0 0 12 12"><path d="M11 1c0 4-2 6-6 6H0"/></svg>';
  return el;
}

function arrowWidget(): HTMLElement {
  const el = document.createElement('span');
  el.setAttribute('data-cc-arrow', '');
  el.setAttribute('aria-hidden', 'true');
  el.contentEditable = 'false';
  return el;
}

function toolsWidget(view: EditorView, getPos: () => number | undefined, variant: ConclusionVariant, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.conclusion;
  const bar = blockPill('data-conclusion-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const add = pillButton(L.addReason, () => { const p = pos(); if (p !== null) addReason(view, p); }, `+ ${L.reason}`);
  bar.append(designButtons(CONCLUSION_DESIGNS, variant, (v) => { const p = pos(); if (p !== null) setConclusionVariant(view, p, v); }), add, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

function conclusionDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.conclusion;
  const current = conclusionAt(state.selection.$from);
  let n = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'conclusion') return !node.isTextblock;
    const t = n++;
    const variant = node.attrs.variant as ConclusionVariant;
    const reasons = node.childCount - 1;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, variant, node.attrs),
      { side: -1, key: `cc-tools-${t}-${variant}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    const blockAttrs: Record<string, string> = {};
    if (current?.pos === pos) blockAttrs['data-cc-current'] = '';
    if (reasons > 0) blockAttrs['data-cc-reasons'] = String(reasons);
    if (Object.keys(blockAttrs).length) decos.push(Decoration.node(pos, pos + node.nodeSize, blockAttrs));
    let childPos = pos + 1;
    node.forEach((child, _o, i) => {
      const end = childPos + child.nodeSize;
      const attrs: Record<string, string> = {};
      if (child.content.size === 0) {
        attrs['data-cc-empty'] = '';
        attrs['data-cc-placeholder'] = i < reasons ? L.reasonPlaceholder : L.placeholder;
      }
      if (i === 0 && i < reasons) attrs['data-cc-first'] = '';
      if (variant === 'funnel' && i < reasons) {
        const { top, bottom } = funnelBand(i, reasons);
        attrs.style = `--top: ${top * 100}%; --bottom: ${bottom * 100}%`;
      }
      if (Object.keys(attrs).length) decos.push(Decoration.node(childPos, end, attrs));
      // The brace sits just above the conclusion, below any reasons; the arrow's turn and head
      // inside the conclusion's text (its ::after holds the placeholder).
      if (variant === 'brace' && i === reasons) decos.push(Decoration.widget(childPos, braceWidget, { side: -1, key: `cc-brace-${t}`, ignoreSelection: true }));
      if (variant === 'arrow' && i === reasons) decos.push(Decoration.widget(childPos + 1, arrowWidget, { side: -1, key: `cc-arrow-${t}`, ignoreSelection: true }));
      childPos = end;
    });
    return false;
  });
  return n ? DecorationSet.create(state.doc, decos) : null;
}

const conclusionKey = new PluginKey('conclusion');

// Keys and drawing, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const ConclusionBehaviour = Extension.create({
  name: 'conclusionBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(conclusionEnter),
      Tab: run(conclusionTab(1)),
      'Shift-Tab': run(conclusionTab(-1)),
      Backspace: run(conclusionBackspace),
      Delete: run(conclusionDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: conclusionKey, props: { decorations: conclusionDecorations } })];
  },
});

export const ConclusionExtensions = [ConclusionBlock, ConclusionReason, ConclusionText, ConclusionBehaviour];
