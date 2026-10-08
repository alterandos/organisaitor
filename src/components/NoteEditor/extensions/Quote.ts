import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, selectButton, pillButton, type BlockDesign } from './blockDesigns';

// A quote in a note (`\quote`, or Quote on selected text): the words, and who said them, where
// and when. Note-taking structure only, like the timeline (extensions/Timeline.ts).
//
//   quoteBlock   variant attr: how it's drawn ('classic', 'card', 'pull'); hidden attr: what a
//                hidden field held, so showing it again brings the text back
//   quoteText    the quote itself
//   quoteField   one attribution field (field attr: QUOTE_FIELDS key), in QUOTE_FIELDS order;
//                only the fields being shown are in the document
//
// Keys: Enter in the quote goes to the first field, Enter in a field to the next, and out of the
// quote after the last; Tab / Shift+Tab move between the parts; Backspace at the start of a part
// steps back rather than merging two parts. Shift+Enter is a line break in the quote.

export const QUOTE_VARIANTS = ['classic', 'card', 'pull'] as const;
export type QuoteVariant = typeof QUOTE_VARIANTS[number];

export const QUOTE_FIELDS = ['who', 'role', 'source', 'when', 'where', 'link'] as const;
export type QuoteField = typeof QUOTE_FIELDS[number];
export const DEFAULT_QUOTE_FIELDS: QuoteField[] = ['who', 'source', 'when'];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const QuoteBlock = Node.create({
  name: 'quoteBlock',
  group: 'block',
  content: 'quoteText quoteField*',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: {
        default: 'classic' satisfies QuoteVariant,
        parseHTML: (el) => oneOf(QUOTE_VARIANTS, el.getAttribute('data-variant'), 'classic'),
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
      hidden: {
        default: {},
        parseHTML: (el) => { try { return JSON.parse(el.getAttribute('data-hidden') || '{}'); } catch { return {}; } },
        renderHTML: (attrs) => (Object.keys(attrs.hidden ?? {}).length ? { 'data-hidden': JSON.stringify(attrs.hidden) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="quote"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'quote', 'data-note-block': '' }), 0];
  },
});

export const QuoteText = Node.create({
  name: 'quoteText',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-qb-text]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-qb-text': '' }), 0];
  },
});

export const QuoteFieldNode = Node.create({
  name: 'quoteField',
  content: 'text*',
  defining: true,

  addAttributes() {
    return {
      field: {
        default: 'who',
        parseHTML: (el) => oneOf(QUOTE_FIELDS, el.getAttribute('data-qb-field'), 'who'),
        renderHTML: (attrs) => ({ 'data-qb-field': attrs.field }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-qb-field]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes, 0];
  },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface QuoteAt {
  quote:    PMNode;
  pos:      number;     // the quoteBlock's position
  partIndex: number;    // which child the position is in (0 = the quote text)
  partPos:  number;     // that child's position
}

function quoteAt($pos: ResolvedPos): QuoteAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'quoteBlock') continue;
    const partIndex = d < $pos.depth ? $pos.index(d) : 0;
    const quote = $pos.node(d);
    const pos = $pos.before(d);
    let partPos = pos + 1;
    for (let i = 0; i < partIndex; i++) partPos += quote.child(i).nodeSize;
    return { quote, pos, partIndex, partPos };
  }
  return null;
}

const partStart = (q: QuoteAt, index: number) => {
  let p = q.pos + 1;
  for (let i = 0; i < index; i++) p += q.quote.child(i).nodeSize;
  return p;
};

const fieldsOf = (quote: PMNode): QuoteField[] => {
  const out: QuoteField[] = [];
  quote.forEach((child, _o, i) => { if (i > 0) out.push(child.attrs.field as QuoteField); });
  return out;
};

const isEmptyQuote = (quote: PMNode) => quote.textContent.trim() === '';

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making one ───────────────────────────────────────────────────────────────

function quoteNode(state: EditorState, text: string, fields: QuoteField[] = DEFAULT_QUOTE_FIELDS): PMNode {
  const { quoteBlock, quoteText, quoteField } = state.schema.nodes;
  return quoteBlock.create(null, [
    quoteText.create(null, text ? state.schema.text(text) : null),
    ...QUOTE_FIELDS.filter((f) => fields.includes(f)).map((field) => quoteField.create({ field })),
  ]);
}

// Puts `node` in place of the empty textblock at `$pos`, or after the block it's in (or the
// nearest container that can hold it). Returns where it went.
function placeBlock(tr: Transaction, from: number, node: PMNode): number | null {
  const $pos = tr.doc.resolve(from);
  const d = $pos.depth;
  if ($pos.parent.isTextblock && $pos.parent.content.size === 0 && d > 0
    && $pos.node(d - 1).canReplaceWith($pos.index(d - 1), $pos.index(d - 1) + 1, node.type)) {
    const at = $pos.before(d);
    tr.replaceWith(at, $pos.after(d), node);
    return at;
  }
  for (let depth = d; depth > 0; depth--) {
    const index = $pos.indexAfter(depth - 1);
    if (!$pos.node(depth - 1).canReplaceWith(index, index, node.type)) continue;
    const at = $pos.after(depth);
    tr.insert(at, node);
    return at;
  }
  return null;
}

// `\quote`: replaces from..to (what was typed, and the space before it) with an empty quote,
// the cursor in its text.
export function insertQuote(state: EditorState, from: number, to: number): Transaction | null {
  if (!state.schema.nodes.quoteBlock) return null;
  const $start = state.doc.resolve(from);
  while (from > $start.start() && /\s/.test(state.doc.textBetween(from - 1, from))) from--;
  const tr = state.tr.delete(from, to);
  const at = placeBlock(tr, from, quoteNode(state, ''));
  if (at === null) return null;
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

// Quote on selected text (the selection menu): the selected words become the quote, the cursor
// in its first field, ready for who said it.
export function quoteFromSelection(view: EditorView, from: number, to: number): void {
  const state = view.state;
  if (!state.schema.nodes.quoteBlock) return;
  const text = state.doc.textBetween(from, to, ' ').replace(/^[\s“”"']+|[\s“”"']+$/g, '');
  if (!text) return;
  const tr = state.tr.delete(from, to);
  const node = quoteNode(state, text);
  const at = placeBlock(tr, tr.mapping.map(from), node);
  if (at === null) return;
  const firstField = at + 1 + node.child(0).nodeSize;
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(firstField + 1))).scrollIntoView());
  view.focus();
}

// ── Settings: style and fields ───────────────────────────────────────────────

export function setQuoteVariant(view: EditorView, pos: number, variant: QuoteVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'quoteBlock') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

// Shows a field (in its place in QUOTE_FIELDS, with what it held when hidden) or hides it (its
// text kept in the quote's `hidden` attr).
export function toggleQuoteField(view: EditorView, pos: number, field: QuoteField): void {
  const state = view.state;
  const quote = state.doc.nodeAt(pos);
  if (quote?.type.name !== 'quoteBlock') return;
  const hidden = { ...(quote.attrs.hidden as Record<string, string>) };
  const tr = state.tr;
  let shownAt = -1;
  for (let i = 1, p = pos + 1 + quote.child(0).nodeSize; i < quote.childCount; p += quote.child(i).nodeSize, i++) {
    if (quote.child(i).attrs.field === field) shownAt = p;
  }
  if (shownAt >= 0) {
    const child = state.doc.nodeAt(shownAt)!;
    if (child.textContent) hidden[field] = child.textContent;
    tr.delete(shownAt, shownAt + child.nodeSize);
  } else {
    const order = QUOTE_FIELDS.indexOf(field);
    let insertAt = pos + 1 + quote.child(0).nodeSize;
    quote.forEach((child, _o, i) => {
      if (i > 0 && QUOTE_FIELDS.indexOf(child.attrs.field) < order) insertAt += child.nodeSize;
    });
    const text = hidden[field];
    delete hidden[field];
    tr.insert(insertAt, state.schema.nodes.quoteField.create({ field }, text ? state.schema.text(text) : null));
  }
  tr.setNodeAttribute(pos, 'hidden', hidden);
  view.dispatch(tr);
}

export function quotePosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="quote"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'quoteBlock' ? pos : null;
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

function leaveQuote(state: EditorState, q: QuoteAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const after = q.pos + q.quote.nodeSize;
  const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  return true;
}

// To the end of part `index` (or its start).
function toPart(state: EditorState, q: QuoteAt, index: number, end: boolean, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) {
    const start = partStart(q, index);
    const pos = end ? start + 1 + q.quote.child(index).content.size : start + 1;
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
  }
  return true;
}

export const quoteEnter: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const q = quoteAt($from);
  if (!q || !$from.parent.isTextblock) return false;
  if (isEmptyQuote(q.quote) && q.partIndex === 0) {
    if (dispatch) {
      const tr = state.tr.replaceWith(q.pos, q.pos + q.quote.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, q.pos + 1)));
    }
    return true;
  }
  if (q.partIndex + 1 < q.quote.childCount) return toPart(state, q, q.partIndex + 1, true, dispatch);
  return leaveQuote(state, q, dispatch);
};

export const quoteTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const q = quoteAt(state.selection.$from);
  if (!q) return false;
  const next = q.partIndex + dir;
  if (next < 0 || next >= q.quote.childCount) return true;
  return toPart(state, q, next, true, dispatch);
};

export const quoteBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const q = quoteAt($from);
  if (!q) return false;
  if (q.partIndex === 0) {
    if (isEmptyQuote(q.quote) && dispatch) {
      const tr = state.tr.replaceWith(q.pos, q.pos + q.quote.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, q.pos + 1)));
    }
    return true;
  }
  return toPart(state, q, q.partIndex - 1, true, dispatch);
};

export const quoteDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!quoteAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

// Per quote: the style and field buttons (top right; shown on hover, while editing it, always on
// touch), which quote is being edited, the speaker's initials (the card style's avatar), and the
// fields' states — an empty field shows (with its placeholder) only while the quote is being
// edited; the first field shown leads the attribution with a dash, the rest follow a dot.
function quoteDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.quote;
  const current = quoteAt(state.selection.$from);
  let n = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'quoteBlock') return !node.isTextblock;
    const t = n++;
    const editing = current?.pos === pos;
    const variant = node.attrs.variant as QuoteVariant;
    const shown = fieldsOf(node);
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, variant, shown, node.attrs),
      { side: -1, key: `quote-tools-${t}-${variant}-${shown.join(',')}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    if (editing) decos.push(Decoration.node(pos, pos + node.nodeSize, { 'data-qb-current': '' }));
    let childPos = pos + 1;
    let lead = true;
    node.forEach((child, _o, i) => {
      const end = childPos + child.nodeSize;
      const empty = child.content.size === 0;
      if (i === 0) {
        if (empty) decos.push(Decoration.node(childPos, end, { 'data-qb-empty': '', 'data-qb-placeholder': L.textPlaceholder }));
      } else {
        const field = child.attrs.field as QuoteField;
        const attrs: Record<string, string> = {};
        if (empty && !editing) attrs['data-qb-hide'] = '';
        else { attrs[lead ? 'data-qb-lead' : 'data-qb-sep'] = ''; lead = false; }
        if (empty) { attrs['data-qb-empty'] = ''; attrs['data-qb-placeholder'] = L.fieldPlaceholders[field]; }
        if (field === 'who' && !empty) attrs['data-qb-initials'] = initials(child.textContent);
        decos.push(Decoration.node(childPos, end, attrs));
      }
      childPos = end;
    });
    return false;
  });
  return n ? DecorationSet.create(state.doc, decos) : null;
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w)).map((w) => w[0].toUpperCase()).filter((_, i, a) => i === 0 || i === a.length - 1).join('').slice(0, 2);

// Its designs (Block designs, blockDesigns.ts).
const DESIGN_ICONS: Record<QuoteVariant, string> = {
  classic: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5c0-1 .7-1.6 1.6-1.6M3 4.5v2.2h2.2V4.5H3ZM7.2 4.5c0-1 .7-1.6 1.6-1.6M7.2 4.5v2.2h2.2V4.5H7.2Z"/><path d="M3 10h10M3 13h7"/></svg>',
  card:    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M1.5 2.5v11"/><path d="M5 7h6.5M5 10h4"/></svg>',
  pull:    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5h12M2 13.5h12"/><path d="M4 7h8M5.5 10h5"/></svg>',
};

export const QUOTE_DESIGNS: BlockDesign<QuoteVariant>[] = QUOTE_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.quote.styles[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, variant: QuoteVariant, shown: QuoteField[], attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.quote;
  const bar = blockPill('data-quote-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const fields = document.createElement('span');
  fields.setAttribute('data-qb-fields', '');
  for (const f of QUOTE_FIELDS) {
    const on = shown.includes(f);
    const b = pillButton(on ? L.hideField(L.fields[f]) : L.showField(L.fields[f]), () => { const p = pos(); if (p !== null) toggleQuoteField(view, p, f); }, L.fields[f]);
    b.setAttribute('data-qb-tool', 'field');
    b.setAttribute('aria-pressed', String(on));
    fields.append(b);
  }
  bar.append(designButtons(QUOTE_DESIGNS, variant, (v) => { const p = pos(); if (p !== null) setQuoteVariant(view, p, v); }), fields, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

const quoteKey = new PluginKey('quoteBlock');

// Keys and drawing, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const QuoteBehaviour = Extension.create({
  name: 'quoteBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(quoteEnter),
      Tab: run(quoteTab(1)),
      'Shift-Tab': run(quoteTab(-1)),
      Backspace: run(quoteBackspace),
      Delete: run(quoteDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: quoteKey, props: { decorations: quoteDecorations } })];
  },
});

export const QuoteExtensions = [QuoteBlock, QuoteText, QuoteFieldNode, QuoteBehaviour];
