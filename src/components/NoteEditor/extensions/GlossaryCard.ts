import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LABELS } from '@/config/labels';
import { useNoteStore } from '@/store/noteStore';
import type { CollectionId, NoteId } from '@/types';
import { BUILTIN_TAGS } from '../builtinTags';
import type { NoteObjectContext } from '../objects/types';
import { applyFrameAttrs, blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, placeBlock, replaceTypedWithBlock, selectButton, typeIntoBlockPlugin, type BlockDesign } from './blockDesigns';
import { GlossaryCardBody } from './GlossaryCardBody';

// A Glossary card in a note (`\definition`, `\acronym`, `\concept`): one atom node that points at a
// Glossary record (StructuredTagEntry) by `entryId`, never a copy of it. Marked text in a sentence
// and a card are two ways of showing the same record, so editing either changes both, and the
// Glossary lists it once. The record holds the content (its fields come from the type's schema in
// config/structuredTagTypes.ts); the node holds only how this card looks (`variant`, frames).
//
// Deleting a card leaves its record, as deleting marked text does: it may be shown elsewhere, and
// the Glossary is where a record is deleted.

export const GLOSSARY_CARD_VARIANTS = ['card', 'split', 'compact'] as const;
export type GlossaryCardVariant = typeof GLOSSARY_CARD_VARIANTS[number];

const D = LABELS.glossaryCard.designs;
export const GLOSSARY_CARD_DESIGNS: BlockDesign<GlossaryCardVariant>[] = [
  { id: 'card',    label: D.card,    icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M4.5 5.5h5M4.5 8h7M4.5 10.5h6"/></svg>' },
  { id: 'split',   label: D.split,   icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5.5h3.5" stroke-width="2"/><path d="M7.5 3v10"/><path d="M9.5 5h4.5M9.5 8h4.5M9.5 11h3"/></svg>' },
  { id: 'compact', label: D.compact, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h3.5M7.5 8h6.5"/><path d="M2 5h12M2 11h12" opacity=".4"/></svg>' },
];

// How wide a card is. Standard is one width for every card, so cards in a row sit side by side
// and look alike; the rest are fractions of the column (dragging the edge snaps to them). Unset
// means the design's own: Standard for Card, the column for Split and Compact (line-shaped).
export const GLOSSARY_CARD_WIDTHS = ['standard', 'third', 'half', 'full'] as const;
export type GlossaryCardWidth = typeof GLOSSARY_CARD_WIDTHS[number];
export const STANDARD_CARD_REM = 26;

export function cardWidth(attrs: Record<string, unknown>): GlossaryCardWidth {
  const w = attrs.width as string | null;
  if ((GLOSSARY_CARD_WIDTHS as readonly string[]).includes(w ?? '')) return w as GlossaryCardWidth;
  return attrs.variant === 'card' ? 'standard' : 'full';
}

// The width a drag ends at: the nearest of the four, `fraction` being the card's share of the column.
export function snapCardWidth(fraction: number, columnPx: number, remPx = 16): GlossaryCardWidth {
  const stops: [GlossaryCardWidth, number][] = [
    ['third', 1 / 3], ['half', 1 / 2], ['full', 1],
    ['standard', Math.min(1, (STANDARD_CARD_REM * remPx) / Math.max(1, columnPx))],
  ];
  return stops.reduce((best, st) => (Math.abs(st[1] - fraction) < Math.abs(best[1] - fraction) ? st : best))[0];
}

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const GlossaryCard = Node.create({
  name: 'glossaryCard',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      entryId: { default: null, parseHTML: (el) => el.getAttribute('data-entry-id'), renderHTML: (a) => ({ 'data-entry-id': a.entryId }) },
      variant: { default: 'card', parseHTML: (el) => oneOf(GLOSSARY_CARD_VARIANTS, el.getAttribute('data-variant'), 'card'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      width:   { default: null, parseHTML: (el) => el.getAttribute('data-card-width'), renderHTML: (a) => (a.width ? { 'data-card-width': a.width } : {}) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="glossary-card"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'glossary-card', 'data-note-block': '' })]; },

  addNodeView() {
    return ({ node, editor, getPos }) => new GlossaryCardView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

// ── Making and changing ──────────────────────────────────────────────────────

// A new record of `typeKey` in the note `ctx` names, for a card to show.
export function newGlossaryRecord(typeKey: string, ctx: NoteObjectContext): string | null {
  const tag = BUILTIN_TAGS.find((t) => t.typeKey === typeKey);
  if (!tag) return null;
  return useNoteStore.getState().addStructuredTagEntry({
    typeKey, tagId: tag.id, term: '', fields: {},
    noteId: ctx.noteId as NoteId, collectionId: ctx.collectionId as CollectionId | null,
  });
}

// `\definition` (and the others): a new record and its card in place of what was typed, the
// cursor in the card's term.
export function insertGlossaryCard(view: EditorView, from: number, to: number, typeKey: string, ctx: NoteObjectContext | null): void {
  const type = view.state.schema.nodes.glossaryCard;
  if (!type || !ctx) return;
  const entryId = newGlossaryRecord(typeKey, ctx);
  if (!entryId) return;
  const made = replaceTypedWithBlock(view.state, from, to, type.create({ entryId }));
  if (!made) return;
  view.dispatch(made.tr.setSelection(NodeSelection.create(made.tr.doc, made.at)).scrollIntoView());
  focusGlossaryCard(view, made.at);
}

// "Show as a card" on marked text: a card for the same record, after the block the text is in.
export function insertCardAfter(state: EditorState, pos: number, entryId: string): Transaction | null {
  const type = state.schema.nodes.glossaryCard;
  if (!type) return null;
  const tr = state.tr;
  const at = placeBlock(tr, pos, type.create({ entryId }));
  return at === null ? null : tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView();
}

export function setGlossaryCardVariant(view: EditorView, pos: number, variant: GlossaryCardVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'glossaryCard') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

export function setGlossaryCardWidth(view: EditorView, pos: number, width: GlossaryCardWidth): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'glossaryCard') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width }));
}

// Puts the cursor in the card's term (after `\definition`, Enter on a selected card). `text` is
// typed there: keys that reached the note while the card was selected rather than its term.
export function focusGlossaryCard(view: EditorView, pos: number, text = ''): void {
  (view.nodeDOM(pos) as HTMLElement | null)?.dispatchEvent(new CustomEvent('glossary-card-focus', { detail: { text } }));
}


// Done with the card (Ctrl+Enter in it): the cursor to the text after it, a new line if there's none.
export function leaveGlossaryCard(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  const after = pos + node.nodeSize;
  let tr = view.state.tr;
  const found = Selection.findFrom(tr.doc.resolve(after), 1, true);
  if (found && found.from >= after) tr = tr.setSelection(found);
  else {
    const paragraph = view.state.schema.nodes.paragraph;
    const $after = tr.doc.resolve(after);
    if (!paragraph || !$after.parent.canReplaceWith($after.index(), $after.index(), paragraph)) return;
    tr = tr.insert(after, paragraph.create()).setSelection(TextSelection.create(tr.doc, after + 1));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function glossaryCardPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="glossary-card"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0);
    for (const p of [pos, pos - 1]) if (view.state.doc.nodeAt(p)?.type.name === 'glossaryCard') return p;
    return null;
  } catch { return null; }
}

// ── The view ─────────────────────────────────────────────────────────────────
// The pill (design, frames, select) is plain DOM like every block's; the card itself is a React
// component (GlossaryCardBody), because it edits a record (lists, a picture, links to other
// entries) rather than the note's text.

class GlossaryCardView {
  dom: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;
  private pill: HTMLElement;
  private body: HTMLElement;
  private handle: HTMLElement;
  private root: Root;
  // Focus asked for before the card was drawn (React draws it a moment later): the body takes it
  // when it mounts. `n` changes per request.
  private focusRequest = { n: 0, text: '' };

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.setAttribute('data-type', 'glossary-card');
    this.dom.setAttribute('data-note-block', '');
    this.dom.contentEditable = 'false';
    this.pill = document.createElement('div');
    this.body = document.createElement('div');
    this.body.setAttribute('data-glossary-card-body', '');
    this.handle = this.resizeHandle();
    this.dom.append(this.pill, this.body, this.handle);
    this.root = createRoot(this.body);
    this.dom.addEventListener('glossary-card-focus', (e) => {
      this.focusRequest = { n: this.focusRequest.n + 1, text: (e as CustomEvent<{ text?: string }>).detail?.text ?? '' };
      this.render();
    });
    this.render();
  }

  private pillPos = () => { const p = this.getPos(); return p === undefined ? undefined : p + 1; };

  private leave = () => {
    const pos = this.getPos();
    if (pos !== undefined) leaveGlossaryCard(this.editor.view, pos);
  };

  private selectSelf = () => {
    const pos = this.getPos();
    if (pos === undefined) return;
    const view = this.editor.view;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  };

  // The right edge: drag to resize, snapping to Standard, a third, half or the column (shown live).
  private resizeHandle(): HTMLElement {
    const h = document.createElement('div');
    h.setAttribute('data-card-resize', '');
    h.title = LABELS.glossaryCard.resize;
    h.addEventListener('pointerdown', (e) => {
      const view = this.editor.view;
      const column = this.dom.parentElement;
      if (!view.editable || !column) return;
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const left = this.dom.getBoundingClientRect().left;
      const columnPx = column.getBoundingClientRect().width;
      const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      let width = cardWidth(this.node.attrs);
      const move = (ev: PointerEvent) => {
        width = snapCardWidth((ev.clientX - left) / columnPx, columnPx, remPx);
        this.dom.setAttribute('data-card-width-shown', width);
      };
      const up = () => {
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
        h.removeEventListener('pointercancel', up);
        const p = this.getPos();
        if (p !== undefined) setGlossaryCardWidth(view, p, width);
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
    return h;
  }

  private render() {
    const a = this.node.attrs;
    this.dom.setAttribute('data-variant', a.variant as string);
    this.dom.setAttribute('data-card-width-shown', cardWidth(a));
    applyFrameAttrs(this.dom, a);
    const view = this.editor.view;
    const getPos = this.pillPos;
    const bar = blockPill('data-glossary-tools');
    const pick = (v: GlossaryCardVariant) => { const p = this.getPos(); if (p !== undefined && view.editable) setGlossaryCardVariant(view, p, v); };
    const width = cardWidth(a);
    const next = GLOSSARY_CARD_WIDTHS[(GLOSSARY_CARD_WIDTHS.indexOf(width) + 1) % GLOSSARY_CARD_WIDTHS.length];
    const W = LABELS.glossaryCard;
    const setNext = () => { const p = this.getPos(); if (p !== undefined && view.editable) setGlossaryCardWidth(view, p, next); };
    const widthBtn = pillButton(`${W.width}: ${W.widths[width]}`, setNext, W.widths[width]);
    widthBtn.setAttribute('data-card-tool', 'width');
    bar.append(designButtons(GLOSSARY_CARD_DESIGNS, a.variant as GlossaryCardVariant, pick), widthBtn, frameButtons(view, getPos, a), selectButton(view, getPos));
    this.pill.replaceWith(bar);
    this.pill = bar;
    this.root.render(createElement(GlossaryCardBody, {
      entryId:  a.entryId as string | null,
      variant:  a.variant as GlossaryCardVariant,
      editable: this.editor.isEditable,
      focusRequest: this.focusRequest,
      onEscape: this.selectSelf,
      onDone:   this.leave,
    }));
  }

  update(node: PMNode) {
    if (node.type.name !== 'glossaryCard') return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode() { this.dom.classList.add('ProseMirror-selectednode'); }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode'); }

  stopEvent(e: Event) {
    const t = e.target as globalThis.Node | null;
    return !!t && (this.body.contains(t) || this.pill.contains(t) || this.handle.contains(t));
  }

  ignoreMutation() { return true; }

  // Unmounting while React may be mid-render isn't allowed synchronously (artifactGroups.ts).
  destroy() { const root = this.root; setTimeout(() => root.unmount(), 0); }
}

// Enter on a selected card puts the cursor in its term, and typing on a selected card types into
// its term (never replaces it: right after `\definition` the card is selected until it's drawn).
export const GlossaryCardBehaviour = Extension.create({
  name: 'glossaryCardBehaviour',
  priority: 110,
  addProseMirrorPlugins() {
    return [typeIntoBlockPlugin(['glossaryCard'], (view, pos, text) => focusGlossaryCard(view, pos, text))];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const sel = this.editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'glossaryCard') return false;
        focusGlossaryCard(this.editor.view, sel.from);
        return true;
      },
    };
  },
});

export const GlossaryCardExtensions = [GlossaryCard, GlossaryCardBehaviour];
