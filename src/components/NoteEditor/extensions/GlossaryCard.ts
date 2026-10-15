import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LABELS } from '@/config/labels';
import { useNoteStore } from '@/store/noteStore';
import { getStructuredTagType } from '@/config/structuredTagTypes';
import { confirmGlossaryDelete, deleteGlossaryEntryNow } from '@/services/glossaryDelete';
import type { CollectionId, NoteId } from '@/types';
import { BUILTIN_TAGS } from '../builtinTags';
import type { NoteObjectContext } from '../objects/types';
import { applyFrameAttrs, blockFrameAttributes, blockPill, designButtons, frameButtons, moveFromBlock, openBlockPopover, pillButton, placeBlock, registerEnterableBlock, popoverClass as pop, replaceTypedWithBlock, selectButton, typeIntoBlockPlugin, type BlockDesign } from './blockDesigns';
import { deleteForever, trashedBy } from '@/services/trash';
import { GlossaryCardBody } from './GlossaryCardBody';
import { cardToChip, insertGlossaryChip } from './GlossaryChip';

// A Glossary card in a note (`\definition`, `\acronym`, `\concept`): one atom node that points at a
// Glossary record (StructuredTagEntry) by `entryId`, never a copy of it. Marked text in a sentence
// and a card are two ways of showing the same record, so editing either changes both, and the
// Glossary lists it once. The record holds the content (its fields come from the type's schema in
// config/structuredTagTypes.ts); the node holds only how this card looks (`variant`, frames).
//
// Deleting the card a record is defined by deletes the record and its links, asked first (see
// "Deleting the definition" below); a card for a record defined in another note goes on its own.

export const GLOSSARY_CARD_VARIANTS = ['card', 'compact'] as const;
export type GlossaryCardVariant = typeof GLOSSARY_CARD_VARIANTS[number];

const D = LABELS.glossaryCard.designs;
export const GLOSSARY_CARD_DESIGNS: BlockDesign<GlossaryCardVariant>[] = [
  { id: 'card',    label: D.card,    icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M4.5 5.5h5M4.5 8h7M4.5 10.5h6"/></svg>' },
  { id: 'compact', label: D.compact, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.3"/><path d="M5.5 8h2.5M10 5v6M12 8h2.5"/></svg>' },
];

// The Inline design: not a value of the card's `variant` but the chip (GlossaryChip.ts), the same
// record shown inside a line of text. Offered beside Card and Compact in the pill and Design ▸;
// picking it turns the card into a chip (cardToChip), and "Show as a card" turns it back.
export type GlossaryCardDesign = GlossaryCardVariant | 'inline';
export const GLOSSARY_CARD_DESIGNS_WITH_INLINE: BlockDesign<GlossaryCardDesign>[] = [
  ...GLOSSARY_CARD_DESIGNS,
  { id: 'inline', label: D.inline, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8h2.5M12 8h2.5"/><rect x="5" y="5.5" width="6" height="5" rx="2.5"/></svg>' },
];

// How wide a card is. Standard is one width for every card, so cards in a row sit side by side
// and look alike; the rest are fractions of the column (dragging the edge snaps to them). Unset
// means the design's own: Standard for Card, the column for Compact (line-shaped).
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
      // Split (retired 2026-10-13, at the user's request) reads as Compact, its nearest design.
      variant: { default: 'card', parseHTML: (el) => oneOf(GLOSSARY_CARD_VARIANTS, el.getAttribute('data-variant') === 'split' ? 'compact' : el.getAttribute('data-variant'), 'card'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
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
// Where it goes follows the card category (objects/blockCategories.ts): after text on the line, or
// on a bullet, it goes in as a chip right there (GlossaryChip.ts); on an empty line, as the card.
export function insertGlossaryCard(view: EditorView, from: number, to: number, typeKey: string, ctx: NoteObjectContext | null): void {
  const type = view.state.schema.nodes.glossaryCard;
  if (!type || !ctx) return;
  const entryId = newGlossaryRecord(typeKey, ctx);
  if (!entryId) return;
  if (goesInline(view.state, from, to)) { insertGlossaryChip(view, from, to, entryId); return; }
  const made = replaceTypedWithBlock(view.state, from, to, type.create({ entryId }));
  if (!made) return;
  view.dispatch(made.tr.setSelection(NodeSelection.create(made.tr.doc, made.at)).scrollIntoView());
  focusGlossaryCard(view, made.at);
}

// Whether a card-family block typed at from..to goes in as a chip: there's other text on the line,
// or the line is a list item.
export function goesInline(state: EditorState, from: number, to: number): boolean {
  const $from = state.doc.resolve(from);
  const parent = $from.parent;
  if (!parent.isTextblock || !state.schema.nodes.glossaryChip) return false;
  const rest = parent.textBetween(0, $from.parentOffset) + parent.textBetween(state.doc.resolve(to).parentOffset, parent.content.size);
  if (rest.trim() !== '') return true;
  let other = false;   // a chip, maths or other inline thing on the line besides what was typed
  parent.forEach((child, offset) => { const at = $from.start() + offset; if (!child.isText && (at < from || at >= to)) other = true; });
  if (other) return true;
  for (let d = $from.depth - 1; d > 0; d--) if ($from.node(d).type.name === 'listItem') return true;
  return false;
}

// Selected words made into a Glossary card: the one way to make a Definition, Concept or Acronym
// from text since marking text as one (and its popover) was retired, 2026-10-13. The term (and, for
// an acronym, what it stands for) is worked out from the words as before (the type's `infer`); the
// card goes after the paragraph, and the words are linked to it, so hovering them shows it.
export function cardFromSelection(view: EditorView, from: number, to: number, typeKey: string, ctx: NoteObjectContext | null): void {
  const typeDef = getStructuredTagType(typeKey);
  const state = view.state;
  const cardType = state.schema.nodes.glossaryCard;
  if (!typeDef || !ctx || !cardType || from >= to) return;
  const words = state.doc.textBetween(from, to, ' ');
  const inferred = typeDef.infer?.(words, state.doc.resolve(from).parent.textContent) ?? { term: words.trim(), fields: {} };
  const entryId = newGlossaryRecord(typeKey, ctx);
  if (!entryId) return;
  const fields = Object.fromEntries(Object.entries(inferred.fields).filter(([, v]) => v));
  useNoteStore.getState().updateStructuredTagEntry(entryId as never, { term: inferred.term, fields });
  const tr = state.tr;
  const ref = state.schema.marks.conceptRef;
  if (ref) tr.addMark(from, to, ref.create({ entryId, typeKey }));
  const at = placeBlock(tr, to, cardType.create({ entryId }));
  if (at === null) return;
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
  focusGlossaryCard(view, at);
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
export function focusGlossaryCard(view: EditorView, pos: number, text = '', edge?: 'start' | 'end'): void {
  (view.nodeDOM(pos) as HTMLElement | null)?.dispatchEvent(new CustomEvent('glossary-card-focus', { detail: { text, edge } }));
}

// Arrowing into a card (blockDesigns.ts registerEnterableBlock): selected as a block, the cursor
// at the start of its term (from above or the left) or the end of its last field (from below).
registerEnterableBlock('glossaryCard', (view, pos, edge) => {
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  focusGlossaryCard(view, pos, '', edge);
});


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

// Shift+Enter in a card's last field: another card of the same kind, design and width right after
// it, its term ready for typing. It's "fresh" until something is put in it: Enter or Esc in a fresh,
// empty card takes it away again (discardFreshCard). Asked for by the user 2026-10-13.
export function addCardAfter(view: EditorView, pos: number, ctx: NoteObjectContext | null): number | null {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'glossaryCard' || !ctx) return null;
  const raw = useNoteStore.getState().structuredTagEntries[node.attrs.entryId as never] as { typeKey?: string } | undefined;
  if (!raw?.typeKey) return null;
  const entryId = newGlossaryRecord(raw.typeKey, ctx);
  if (!entryId) return null;
  const at = pos + node.nodeSize;
  const tr = view.state.tr.insert(at, node.type.create({ entryId, variant: node.attrs.variant, width: node.attrs.width }));
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
  (view.nodeDOM(at) as HTMLElement | null)?.dispatchEvent(new CustomEvent('glossary-card-focus', { detail: { text: '', fresh: true } }));
  return at;
}

// A fresh card left empty: the card and its record go, with nothing to ask (nothing was written)
// and nothing in the Recycling Bin. Enter goes on to the text after the card before it; Esc selects
// that card.
export function discardFreshCard(view: EditorView, pos: number, how: 'enter' | 'escape'): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'glossaryCard') return;
  const entryId = node.attrs.entryId as string | null;
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize).setMeta(CONFIRMED, true));
  if (entryId) for (const t of trashedBy(() => useNoteStore.getState().deleteStructuredTagEntry(entryId as never))) deleteForever(t);
  const before = view.state.doc.resolve(pos).nodeBefore;
  if (before?.type.name === 'glossaryCard') {
    const prev = pos - before.nodeSize;
    if (how === 'escape') { view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, prev))); view.focus(); }
    else leaveGlossaryCard(view, prev);
    return;
  }
  const found = Selection.findFrom(view.state.doc.resolve(Math.min(pos, view.state.doc.content.size)), 1, true);
  if (found) view.dispatch(view.state.tr.setSelection(found));
  view.focus();
}

// Which side of a card its "+ field" pills float on: the side with room for them, between the card
// and its neighbour in the row (or the edge of the note), right first. Neither: they don't float,
// and the pill's "+ Add" offers the same fields.
export function morePillSide(card: DOMRect, pillsWidth: number, bounds: { left: number; right: number }, neighbours: DOMRect[]): 'right' | 'left' | 'none' {
  const inRow = neighbours.filter((r) => r.bottom > card.top + 4 && r.top < card.bottom - 4);
  const rightLimit = Math.min(bounds.right, ...inRow.filter((r) => r.left >= card.right - 1).map((r) => r.left));
  const leftLimit = Math.max(bounds.left, ...inRow.filter((r) => r.right <= card.left + 1).map((r) => r.right));
  if (rightLimit - card.right >= pillsWidth) return 'right';
  if (card.left - leftLimit >= pillsWidth) return 'left';
  return 'none';
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
  private focusRequest: { n: number; text: string; edge?: 'start' | 'end' } = { n: 0, text: '' };
  // Optional fields opened on this card ("+ Explanation"), and the ones still waiting (reported by
  // the body), for the pill's "+ Add". Fresh: made by Shift+Enter and not written in yet.
  private shown: string[] = [];
  private waiting: { id: string; name: string }[] = [];
  private fresh = false;

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
      const detail = (e as CustomEvent<{ text?: string; fresh?: boolean; edge?: 'start' | 'end' }>).detail;
      this.focusRequest = { n: this.focusRequest.n + 1, text: detail?.text ?? '', edge: detail?.edge };
      if (detail?.fresh) this.fresh = true;
      this.render();
    });
    this.dom.addEventListener('mouseenter', this.placePills);
    this.render();
  }

  private pillPos = () => { const p = this.getPos(); return p === undefined ? undefined : p + 1; };

  private leave = () => {
    const pos = this.getPos();
    if (pos !== undefined) leaveGlossaryCard(this.editor.view, pos);
  };

  private context = (): NoteObjectContext | null => {
    const storage = this.editor.storage as unknown as Record<string, { getContext?: () => NoteObjectContext | null } | undefined>;
    return storage.noteObjectTrigger?.getContext?.() ?? null;
  };

  private addAnother = () => {
    const pos = this.getPos();
    if (pos !== undefined && this.editor.view.editable) addCardAfter(this.editor.view, pos, this.context());
  };

  private discard = (how: 'enter' | 'escape') => {
    const pos = this.getPos();
    if (pos !== undefined) discardFreshCard(this.editor.view, pos, how);
  };

  private showField = (id: string) => {
    if (this.shown.includes(id)) return;
    this.shown = [...this.shown, id];
    this.render();
  };

  private setWaiting = (fields: { id: string; name: string }[]) => {
    if (fields.map((f) => f.id).join() === this.waiting.map((f) => f.id).join()) return;
    this.waiting = fields;
    this.render();
  };

  private touched = () => { this.fresh = false; };

  private leaveBy = (forward: boolean) => {
    const pos = this.getPos();
    if (pos !== undefined) moveFromBlock(this.editor.view, pos, forward);
  };

  // Measured as the pointer arrives, so it follows the card wherever it now sits.
  private placePills = () => {
    const pills = this.dom.querySelector('[data-card-more]') as HTMLElement | null;
    const column = this.dom.parentElement;
    if (!pills || !column) return;
    const box = this.editor.view.dom.getBoundingClientRect();
    const neighbours = Array.from(column.children).filter((c) => c !== this.dom).map((c) => c.getBoundingClientRect());
    this.dom.setAttribute('data-more-side', morePillSide(this.dom.getBoundingClientRect(), pills.offsetWidth + 8, { left: box.left, right: box.right }, neighbours));
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
    applyFrameAttrs(this.dom, { ...a, outlined: false });   // a card has its own border: no Outline (CARD_BLOCK_NODES)
    const view = this.editor.view;
    const getPos = this.pillPos;
    const bar = blockPill('data-glossary-tools');
    const pick = (v: GlossaryCardDesign) => {
      const p = this.getPos();
      if (p === undefined || !view.editable) return;
      if (v === 'inline') cardToChip(view, p);
      else setGlossaryCardVariant(view, p, v);
    };
    // Width isn't in the pill (taken out 2026-10-13: a rare choice, and stepping through widths by
    // clicking was clunky): drag the card's right edge, or Width ▸ in its right-click menu.
    const W = LABELS.glossaryCard;
    const parts: HTMLElement[] = [];
    if (this.waiting.length && view.editable) {
      const add = pillButton(W.addFieldTitle, () => {
        openBlockPopover(add.getBoundingClientRect(), (close) => {
          const box = document.createElement('div');
          const heading = document.createElement('div');
          heading.className = pop.heading;
          heading.textContent = W.addFieldHeading;
          const row = document.createElement('div');
          row.className = pop.row;
          for (const f of this.waiting) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = pop.choice;
            b.textContent = f.name;
            b.addEventListener('click', () => { close(); this.showField(f.id); });
            row.append(b);
          }
          box.append(heading, row);
          return box;
        });
      }, W.addField);
      add.setAttribute('data-card-tool', 'add');
      parts.push(add);
    }
    bar.append(designButtons(GLOSSARY_CARD_DESIGNS_WITH_INLINE, a.variant as GlossaryCardDesign, pick), ...parts, frameButtons(view, getPos, a), selectButton(view, getPos));
    this.pill.replaceWith(bar);
    this.pill = bar;
    this.root.render(createElement(GlossaryCardBody, {
      entryId:  a.entryId as string | null,
      variant:  a.variant as GlossaryCardVariant,
      editable: this.editor.isEditable,
      focusRequest: this.focusRequest,
      onEscape: this.selectSelf,
      onDone:   this.leave,
      shown:    this.shown,
      onShow:   this.showField,
      onWaiting: this.setWaiting,
      fresh:    this.fresh,
      onTouched: this.touched,
      onAddAnother: this.addAnother,
      onDiscard: this.discard,
      onLeave:  this.leaveBy,
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
  destroy() {
    this.dom.removeEventListener('mouseenter', this.placePills);
    const root = this.root;
    setTimeout(() => root.unmount(), 0);
  }
}

// ── Deleting the definition ─────────────────────────────────────────────────
// Deleting the card a record is defined by (in its own note, with no other card or mark for it
// left there) deletes the record and every link to it, asked first (services/glossaryDelete.ts,
// agreed with the user 2026-10-13). The deletion is held back until the answer: cancelled, nothing
// changes; confirmed, it's applied, then the record and its links go. Not asked: a cut (the card
// is being moved), undo and redo, loading a note (its whole content replaced), and a card for a
// record that lives in another note (only this view of it goes).

const holdKey = new PluginKey('glossaryCardDelete');
const CONFIRMED = 'glossaryCardDeleteConfirmed';

function cardEntries(doc: PMNode): Map<string, number> {
  const out = new Map<string, number>();
  doc.descendants((n) => {
    if ((n.type.name === 'glossaryCard' || n.type.name === 'glossaryChip') && n.attrs.entryId) out.set(n.attrs.entryId, (out.get(n.attrs.entryId) ?? 0) + 1);
    else if (n.isText) for (const m of n.marks) if (m.type.name === 'noteTag' && m.attrs.structuredEntryId) out.set(m.attrs.structuredEntryId, (out.get(m.attrs.structuredEntryId) ?? 0) + 1);
    return !n.isTextblock || n.childCount > 0;
  });
  return out;
}

function definitionsDeleted(tr: Transaction, noteId: string | null): string[] {
  if (!tr.docChanged || tr.getMeta(CONFIRMED) || tr.getMeta('uiEvent') === 'cut' || tr.getMeta('history$')) return [];
  // Loading a note replaces the whole document, exactly (setContent); deleting a note's only block doesn't.
  const replacesAll = tr.steps.some((s) => s instanceof ReplaceStep && (s as unknown as { from: number }).from === 0 && (s as unknown as { to: number }).to === tr.before.content.size);
  if (replacesAll) return [];
  const before = cardEntries(tr.before);
  if (!before.size) return [];
  const after = cardEntries(tr.doc);
  const gone: string[] = [];
  for (const id of before.keys()) {
    if (after.has(id)) continue;
    const raw = useNoteStore.getState().structuredTagEntries[id as never] as { noteId?: string } | undefined;
    if (raw && raw.noteId === noteId) gone.push(id);
  }
  return gone;
}

export function glossaryDeletePlugin(noteId: () => string | null): Plugin {
  let view: EditorView | null = null;
  return new Plugin({
    key: holdKey,
    view: (v) => { view = v; return {}; },
    filterTransaction: (tr) => {
      const gone = definitionsDeleted(tr, noteId());
      if (!gone.length || !view) return true;
      void askThenApply(view, tr, gone);
      return false;
    },
  });
}

// Asked for each record; if every one is confirmed (and the note hasn't changed meanwhile), the
// deletion is applied, then the records and their links go.
async function askThenApply(view: EditorView, tr: Transaction, gone: string[]): Promise<void> {
  for (const id of gone) if (!(await confirmGlossaryDelete(id))) return;
  if (!view.state.doc.eq(tr.before)) return;
  const again = view.state.tr;
  for (const step of tr.steps) again.step(step);
  again.setSelection(Selection.fromJSON(again.doc, tr.selection.toJSON()));
  view.dispatch(again.setMeta(CONFIRMED, true).scrollIntoView());
  for (const id of gone) deleteGlossaryEntryNow(id, view.state.schema);
}

// Enter on a selected card puts the cursor in its term, and typing on a selected card types into
// its term (never replaces it: right after `\definition` the card is selected until it's drawn).
export const GlossaryCardBehaviour = Extension.create({
  name: 'glossaryCardBehaviour',
  priority: 110,
  addProseMirrorPlugins() {
    // The open note, read from the `\` trigger's storage (importing it here would loop through
    // the block registry back to this file).
    const storage = this.editor.storage as unknown as Record<string, { getContext?: () => NoteObjectContext | null } | undefined>;
    const noteId = () => storage.noteObjectTrigger?.getContext?.()?.noteId ?? null;
    return [
      typeIntoBlockPlugin(['glossaryCard'], (view, pos, text) => focusGlossaryCard(view, pos, text)),
      glossaryDeletePlugin(noteId),
    ];
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
