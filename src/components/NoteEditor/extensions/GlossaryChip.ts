import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LABELS } from '@/config/labels';
import { useNoteStore } from '@/store/noteStore';
import { glossaryEntry } from '@/services/glossary';
import { GlossaryCardBody } from './GlossaryCardBody';
import { blockPill, designButtons, placeBlock, typeIntoBlockPlugin, type BlockDesign } from './blockDesigns';
import { entryCardContent } from './ConceptRef';
import { registerMarginSource, type MarginItem } from './MarginColumn';
import { BUILTIN_TAGS } from '../builtinTags';

// A Glossary record shown inside a line of text (the card family's Inline design, agreed with the
// user 2026-10-16): a chip with the kind's icon, the term and the start of the meaning. Like the
// card (GlossaryCard.ts) it holds only the record's id, never a copy, so the chip and any card for
// the same record always show the same thing. Hovering shows the whole record; a click opens the
// full card on the line below (a widget, drawn while open and never stored), a click again closes
// it. "Show as a card" turns it into the card block after its line, and a card's Inline design
// turns it back. The chip offers the card's designs too (its open card's pill, Design ▸ on
// right-click, Ctrl+] / Ctrl+[), so the way back is where the way in was (fixed 2026-10-16: a
// chip had no design choice anywhere but its right-click menu, and looked stuck).

export const GlossaryChip = Node.create({
  name: 'glossaryChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      entryId: { default: null, parseHTML: (el) => el.getAttribute('data-entry-id'), renderHTML: (a) => ({ 'data-entry-id': a.entryId }) },
    };
  },

  parseHTML() { return [{ tag: 'span[data-type="glossary-chip"]' }]; },
  // The term as text, so a copy pasted elsewhere still reads.
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'glossary-chip' }), glossaryEntry(node.attrs.entryId as string)?.term ?? ''];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => new GlossaryChipView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

// ── Which chips are open ─────────────────────────────────────────────────────

interface ChipState { open: number[]; focus: { pos: number; n: number; text: string } | null }
type ChipMeta = { toggle: number } | { open: number; focusText?: string } | { close: number };

export const chipKey = new PluginKey<ChipState>('glossaryChipOpen');

const chipAt = (state: EditorState, pos: number) => state.doc.nodeAt(pos)?.type.name === 'glossaryChip';

export function toggleChip(view: EditorView, pos: number): void {
  view.dispatch(view.state.tr.setMeta(chipKey, { toggle: pos } satisfies ChipMeta));
}

// Opens the chip's card with the cursor in its term (after `\definition` inline, Enter on a chip);
// `text` is typed there.
export function openChip(view: EditorView, pos: number, focusText = ''): void {
  view.dispatch(view.state.tr.setMeta(chipKey, { open: pos, focusText } satisfies ChipMeta));
}

// Closes the chip's card, the cursor beside the chip (after it, or before it going back).
export function closeChip(view: EditorView, pos: number, forward = true): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  const tr = view.state.tr.setMeta(chipKey, { close: pos } satisfies ChipMeta);
  tr.setSelection(TextSelection.create(tr.doc, forward ? pos + node.nodeSize : pos));
  view.dispatch(tr);
  view.focus();
}

// ── Making and changing ──────────────────────────────────────────────────────

// A chip for `entryId` in place of from..to (what was typed), its card open, the cursor in its term.
export function insertGlossaryChip(view: EditorView, from: number, to: number, entryId: string): void {
  const type = view.state.schema.nodes.glossaryChip;
  if (!type) return;
  const tr = view.state.tr.replaceWith(from, to, type.create({ entryId }));
  tr.setSelection(NodeSelection.create(tr.doc, from)).setMeta(chipKey, { open: from } satisfies ChipMeta);
  view.dispatch(tr.scrollIntoView());
}

// A card's Inline design: the card becomes a chip at the end of the line before it, or a line of
// its own when there's no line before it.
export function cardToChip(view: EditorView, pos: number): void {
  const state = view.state;
  const card = state.doc.nodeAt(pos);
  const chipType = state.schema.nodes.glossaryChip;
  const paragraph = state.schema.nodes.paragraph;
  if (card?.type.name !== 'glossaryCard' || !chipType || !paragraph) return;
  const chip = chipType.create({ entryId: card.attrs.entryId });
  const before = state.doc.resolve(pos).nodeBefore;
  const tr = state.tr.delete(pos, pos + card.nodeSize);
  let at: number;
  if (before?.isTextblock && before.type === paragraph) {
    at = pos - 1;
    const needsSpace = before.textContent.length > 0 && !/\s$/.test(before.textContent);
    if (needsSpace) { tr.insertText(' ', at); at += 1; }
    tr.insert(at, chip);
  } else {
    tr.insert(pos, paragraph.create(null, chip));
    at = pos + 1;
  }
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
  view.focus();
}

// "Show as a card" on a chip: the card block after the chip's line (the line goes if the chip was
// all it held).
export function chipToCard(view: EditorView, pos: number, variant: 'card' | 'compact' = 'card'): void {
  const state = view.state;
  const chip = state.doc.nodeAt(pos);
  const cardType = state.schema.nodes.glossaryCard;
  if (chip?.type.name !== 'glossaryChip' || !cardType) return;
  let from = pos;
  const prev = state.doc.resolve(pos).nodeBefore;
  if (prev?.isText && prev.text?.endsWith(' ')) from -= 1;
  const tr = state.tr.delete(from, pos + chip.nodeSize).setMeta(chipKey, { close: pos } satisfies ChipMeta);
  const at = placeBlock(tr, Math.min(from, tr.doc.content.size), cardType.create({ entryId: chip.attrs.entryId, variant }));
  if (at === null) return;
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
  view.focus();
}

export function glossaryChipPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="glossary-chip"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0);
    for (const p of [pos, pos - 1]) if (chipAt(view.state, p)) return p;
    return null;
  } catch { return null; }
}

// ── The chip ─────────────────────────────────────────────────────────────────

const HOVER_SHOW_MS = 350;
const HOVER_HIDE_MS = 250;

class GlossaryChipView {
  dom: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;
  private hover: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: () => void;

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;
    this.dom = document.createElement('span');
    this.dom.setAttribute('data-type', 'glossary-chip');
    this.dom.contentEditable = 'false';
    this.dom.tabIndex = -1;
    this.dom.addEventListener('mousedown', (e) => { if (e.button === 0) e.preventDefault(); });
    this.dom.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const p = this.getPos();
      if (p === undefined) return;
      this.hideHover();
      toggleChip(this.editor.view, p);
    });
    this.dom.addEventListener('mouseenter', () => {
      clearTimeout(this.hideTimer);
      this.showTimer = setTimeout(() => this.showHover(), HOVER_SHOW_MS);
    });
    this.dom.addEventListener('mouseleave', () => { clearTimeout(this.showTimer); this.scheduleHide(); });
    // The record changes (its term typed in the open card, another device): draw it again.
    this.unsubscribe = useNoteStore.subscribe((s, prev) => { if (s.structuredTagEntries !== prev.structuredTagEntries) this.render(); });
    this.render();
  }

  private render() {
    const entry = glossaryEntry(this.node.attrs.entryId as string);
    const L = LABELS.glossary;
    this.dom.setAttribute('data-glossary-type', entry?.typeKey ?? '');
    const icon = document.createElement('span');
    icon.setAttribute('data-chip-icon', '');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = entry?.icon ?? '📖';
    const term = document.createElement('strong');
    term.textContent = entry ? entry.term || L.untitled : L.missing;
    const parts: HTMLElement[] = [icon, term];
    const meaning = entry && !entry.locked ? entry.meaning : '';
    if (meaning) {
      const m = document.createElement('span');
      m.setAttribute('data-chip-meaning', '');
      m.textContent = meaning;
      parts.push(m);
    }
    this.dom.replaceChildren(...parts);
    this.dom.title = '';
    this.dom.setAttribute('aria-label', LABELS.glossaryCard.chipLabel(entry?.kindLabel ?? '', entry?.term ?? ''));
  }

  private scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hideHover(), HOVER_HIDE_MS);
  }

  private hideHover() {
    clearTimeout(this.showTimer);
    this.hover?.remove();
    this.hover = null;
  }

  // The whole record under the chip, in the editor's own (unzoomed) pixels, as linked terms do.
  private showHover() {
    const view = this.editor.view;
    const parent = view.dom.parentElement;
    const p = this.getPos();
    if (!parent || p === undefined || (chipKey.getState(view.state)?.open ?? []).includes(p)) return;
    this.hideHover();
    const card = document.createElement('div');
    card.setAttribute('data-concept-hovercard', '');
    card.append(...entryCardContent(glossaryEntry(this.node.attrs.entryId as string)));
    card.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));
    card.addEventListener('mouseleave', () => this.scheduleHide());
    parent.append(card);
    const box = parent.getBoundingClientRect();
    const zoom = parent.offsetWidth ? box.width / parent.offsetWidth || 1 : 1;
    const at = this.dom.getBoundingClientRect();
    card.style.left = `${Math.max(8, Math.min((at.left - box.left) / zoom, parent.clientWidth - card.offsetWidth - 8))}px`;
    card.style.top = `${(at.bottom - box.top) / zoom + 6}px`;
    this.hover = card;
  }

  update(node: PMNode) {
    if (node.type.name !== 'glossaryChip') return false;
    const same = node.attrs.entryId === this.node.attrs.entryId;
    this.node = node;
    if (!same) this.render();
    return true;
  }

  selectNode() { this.dom.classList.add('ProseMirror-selectednode'); }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode'); }
  stopEvent(e: Event) { return e.type === 'click' || e.type === 'mousedown'; }
  ignoreMutation() { return true; }

  destroy() {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.hideHover();
    this.unsubscribe();
  }
}

// ── The open card ────────────────────────────────────────────────────────────
// Drawn after the chip's line as a widget: the same GlossaryCardBody a card block draws, so it
// edits the same record the same way. Esc, Ctrl+Enter or an arrow past its first or last field
// closes it and puts the cursor beside the chip.

// The card's designs, set by GlossaryCard.ts (which imports this file, so it can't be imported back).
let chipDesigns: readonly BlockDesign<'card' | 'compact' | 'inline'>[] = [];
export function setChipDesigns(designs: readonly BlockDesign<'card' | 'compact' | 'inline'>[]): void { chipDesigns = designs; }

function openCard(view: EditorView, chipPos: number, entryId: string, focus: { n: number; text: string } | null): HTMLElement {
  const dom = document.createElement('div');
  dom.setAttribute('data-glossary-chip-card', '');
  dom.contentEditable = 'false';
  const body = document.createElement('div');
  const pos = () => {
    const found = (chipKey.getState(view.state)?.open ?? []).find((p) => view.state.doc.nodeAt(p)?.attrs.entryId === entryId);
    return found ?? chipPos;
  };
  if (view.editable && chipDesigns.length) {
    const bar = blockPill('data-glossary-tools');
    bar.append(designButtons(chipDesigns, 'inline', (v) => { if (v !== 'inline') chipToCard(view, pos(), v); }));
    dom.append(bar);
  }
  dom.append(body);
  const root = createRoot(body);
  let shown: string[] = [];
  const close = (forward = true) => closeChip(view, pos(), forward);
  const render = () => root.render(createElement(GlossaryCardBody, {
    entryId,
    variant: 'card',
    editable: view.editable,
    focusRequest: focus ?? { n: 0, text: '' },
    onEscape: () => close(true),
    onDone: () => close(true),
    shown,
    onShow: (id: string) => { if (!shown.includes(id)) { shown = [...shown, id]; render(); } },
    onWaiting: () => {},
    fresh: false,
    onTouched: () => {},
    onAddAnother: () => {},
    onDiscard: () => close(true),
    onLeave: (forward: boolean) => close(forward),
  }));
  render();
  (dom as HTMLElement & { unmountCard?: () => void }).unmountCard = () => setTimeout(() => root.unmount(), 0);
  return dom;
}

function chipDecorations(state: EditorState): DecorationSet {
  const st = chipKey.getState(state);
  if (!st?.open.length) return DecorationSet.empty;
  const decos: Decoration[] = [];
  for (const p of st.open) {
    const node = state.doc.nodeAt(p);
    if (node?.type.name !== 'glossaryChip') continue;
    const entryId = node.attrs.entryId as string;
    const focus = st.focus?.pos === p ? { n: st.focus.n, text: st.focus.text } : null;
    const end = state.doc.resolve(p).end();
    decos.push(Decoration.widget(end, (view) => openCard(view, p, entryId, focus), {
      side: 1,
      key: `chip-card-${entryId}-${focus?.n ?? 0}`,
      stopEvent: () => true,
      ignoreSelection: true,
      destroy: (dom) => (dom as HTMLElement & { unmountCard?: () => void }).unmountCard?.(),
    }));
  }
  return DecorationSet.create(state.doc, decos);
}

export const GlossaryChipBehaviour = Extension.create({
  name: 'glossaryChipBehaviour',
  priority: 110,
  addProseMirrorPlugins() {
    let focusN = 0;
    return [
      new Plugin<ChipState>({
        key: chipKey,
        state: {
          init: () => ({ open: [], focus: null }),
          apply: (tr, prev, _old, state) => {
            let open = prev.open.map((p) => tr.mapping.map(p, 1));
            let focus = prev.focus ? { ...prev.focus, pos: tr.mapping.map(prev.focus.pos, 1) } : null;
            const meta = tr.getMeta(chipKey) as ChipMeta | undefined;
            if (meta && 'toggle' in meta) open = open.includes(meta.toggle) ? open.filter((p) => p !== meta.toggle) : [...open, meta.toggle];
            if (meta && 'open' in meta) {
              if (!open.includes(meta.open)) open = [...open, meta.open];
              focus = { pos: meta.open, n: ++focusN, text: meta.focusText ?? '' };
            }
            if (meta && 'close' in meta) open = open.filter((p) => p !== meta.close);
            open = open.filter((p) => chipAt(state, p));
            if (focus && !open.includes(focus.pos)) focus = null;
            return { open, focus };
          },
        },
        props: { decorations: chipDecorations },
      }),
      // Typing on a selected chip (right after `\definition` inline, before its card has drawn)
      // types into its term, never replaces it.
      typeIntoBlockPlugin(['glossaryChip'], (view, pos, text) => openChip(view, pos, text)),
    ];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const sel = this.editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'glossaryChip') return false;
        openChip(this.editor.view, sel.from);
        return true;
      },
    };
  },
});

export const GlossaryChipExtensions = [GlossaryChip, GlossaryChipBehaviour];

// Each chip (an inline card) in the margin column too (extensions/MarginColumn.ts): its kind's icon;
// a click opens its card below the line, as clicking the chip does.
registerMarginSource('glossary-chip', (state) => {
  const out: MarginItem[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'glossaryChip') return true;
    const entry = glossaryEntry(node.attrs.entryId as string);
    out.push({
      key: `chip-${node.attrs.entryId}-${pos}`,
      from: pos,
      to: pos + node.nodeSize,
      icon: () => document.createTextNode(entry ? (entry.locked ? '🔒' : entry.icon) : '?'),
      color: BUILTIN_TAGS.find((t) => t.typeKey === entry?.typeKey)?.color ?? 'var(--color-muted)',
      title: entry ? `${entry.term || LABELS.glossary.untitled} · ${entry.kindLabel}` : LABELS.glossary.missing,
      open: (view) => toggleChip(view, pos),
    });
    return false;
  });
  return out;
});
