import { Extension } from '@tiptap/core';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { ContextMenuItem } from '@/contextMenu/types';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { registerEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import styles from './BlockDesigns.module.css';

// ── Frames: outline and shade ────────────────────────────────────────────────
// Any block can be outlined, shaded, or both (one default look each; no colour choices yet). The
// frame is drawn outside the block's own box (an outline and a spread shadow, CSS keyed on
// data-outlined / data-shaded), so no design's layout changes when it's framed.

export type BlockFrame = 'outlined' | 'shaded';
export const BLOCK_FRAMES: BlockFrame[] = ['outlined', 'shaded'];

// Spread into a block node's addAttributes().
export const blockFrameAttributes = () => ({
  outlined: {
    default: false,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-outlined') === 'true',
    renderHTML: (attrs: Record<string, unknown>) => (attrs.outlined ? { 'data-outlined': 'true' } : {}),
  },
  shaded: {
    default: false,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-shaded') === 'true',
    renderHTML: (attrs: Record<string, unknown>) => (attrs.shaded ? { 'data-shaded': 'true' } : {}),
  },
});

export function toggleBlockFrame(view: EditorView, pos: number, frame: BlockFrame): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !NOTE_BLOCK_NODES.has(node.type.name)) return;
  view.dispatch(view.state.tr.setNodeAttribute(pos, frame, !node.attrs[frame]));
}

const FRAME_ICONS: Record<BlockFrame, string> = {
  outlined: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2.5"/></svg>',
  shaded:   '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2.5" fill="currentColor" fill-opacity="0.28" stroke="none"/></svg>',
};

// The pill's frame toggles. `getPos` is the pill widget's; the block starts just before it.
export function frameButtons(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const group = document.createElement('span');
  group.setAttribute('data-block-frames', '');
  for (const frame of BLOCK_FRAMES) {
    const b = pillButton(LABELS.noteBlocks.frames[frame], () => { const p = getPos(); if (p !== undefined) toggleBlockFrame(view, p - 1, frame); });
    b.setAttribute('data-block-frame', frame);
    b.setAttribute('aria-pressed', String(!!attrs[frame]));
    b.innerHTML = FRAME_ICONS[frame];
    group.append(b);
  }
  return group;
}

// Frame ▸ in the block's right-click menu.
export function frameMenuItem(view: EditorView, pos: number, attrs: Record<string, unknown>): ContextMenuItem {
  return {
    id: 'block-frame',
    label: LABELS.noteBlocks.frame,
    icon: '▢',
    submenu: [BLOCK_FRAMES.map((f) => ({ id: `frame-${f}`, label: LABELS.noteBlocks.frames[f], icon: attrs[f] ? '✓' : undefined, run: () => toggleBlockFrame(view, pos, f) }))],
  };
}

// ── Selecting a whole block ──────────────────────────────────────────────────
// Any note block can be selected as one piece (to cut, copy or delete it): the Select button in
// its pill, Select whole block in its right-click menu, or Esc while the cursor is inside it. A
// block's root node is in NOTE_BLOCK_NODES and its DOM carries data-note-block.

export const NOTE_BLOCK_NODES = new Set(['timeline', 'quoteBlock', 'cycle', 'breakdown', 'hierarchy', 'pyramid', 'chart']);

// The note block the selection is inside (the outermost, if blocks were ever nested), or null.
export function blockAround(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let d = 1; d <= $from.depth; d++) {
    if (NOTE_BLOCK_NODES.has($from.node(d).type.name)) return $from.before(d);
  }
  return null;
}

export function selectBlock(view: EditorView, pos: number): void {
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).scrollIntoView());
  view.focus();
}

// The block a DOM element is in, as a document position.
export function blockPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-note-block]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    const node = view.state.doc.nodeAt(pos);
    return node && NOTE_BLOCK_NODES.has(node.type.name) ? pos : null;
  } catch { return null; }
}

const SELECT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v2M14 11v2a1 1 0 0 1-1 1h-2M5 14H3a1 1 0 0 1-1-1v-2M7 2h2M7 14h2M2 7v2M14 7v2"/></svg>';

// The pill's Select button. Every block's pill ends with it (pattern test). `getPos` is the
// pill widget's; the block starts just before it.
export function selectButton(view: EditorView, getPos: () => number | undefined): HTMLButtonElement {
  const b = pillButton(LABELS.noteBlocks.selectBlock, () => {
    const p = getPos();
    if (p !== undefined) selectBlock(view, p - 1);
  });
  b.setAttribute('data-block-select', '');
  b.innerHTML = SELECT_ICON;
  return b;
}

// Esc inside a block selects the whole block (as in Notion); Esc again then goes on to whatever
// is around the editor. Below the default priority, so a `\` session (NoteObjectTrigger), which
// owns Esc while it's open, sees it first.
export const NoteBlockSelect = Extension.create({
  name: 'noteBlockSelect',
  priority: 90,

  addKeyboardShortcuts() {
    return {
      Escape: () => {
        const { state, view } = this.editor;
        if (state.selection instanceof NodeSelection) return false;
        const pos = blockAround(state);
        if (pos === null) return false;
        selectBlock(view, pos);
        return true;
      },
    };
  },
});

registerContextMenuProvider({
  id: 'note-editor.block-select',
  kind: 'note-editor',
  order: 7,
  when: (ctx) => !!ctx.target.closest('[data-note-block]'),
  items: (ctx, scope) => {
    const view = (scope.data as { editor: { view: EditorView } }).editor.view;
    const pos = blockPosAt(view, ctx.target);
    if (pos === null) return [];
    return [{ id: 'select-block', label: LABELS.noteBlocks.selectBlock, icon: '⬚', shortcut: 'Esc', run: () => selectBlock(view, pos) }];
  },
});

// Block designs (CLAUDE.md "Block designs"): every note block (timeline, quote, cycle…) offers
// several designs of the same content, chosen from the pill at its top right or from Design ▸ in
// its right-click menu. A design is the block's `variant` attribute plus its CSS under
// [data-variant="…"]; the content never changes, so switching is always safe. This module is the
// shared half: the design list's shape, the pill and its buttons, the Design ▸ menu, and the small
// popover a block opens from its pill or its parts (a cycle's arrow, an icon slot).

export interface BlockDesign<V extends string = string> {
  id:    V;
  label: string;
  icon:  string;   // a small line drawing (SVG markup, stroked in currentColor by the CSS)
}

// The pill: shown on hover, while the block is being edited and always on touch (the CSS keys on
// data-block-tools). `attr` is the block's own attribute, which only places it.
export function blockPill(attr: string): HTMLDivElement {
  const bar = document.createElement('div');
  bar.contentEditable = 'false';
  bar.setAttribute(attr, '');
  bar.setAttribute('data-block-tools', '');
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  return bar;
}

export function pillButton(title: string, onClick: (e: MouseEvent) => void, label?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  if (label !== undefined) b.textContent = label;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => { e.preventDefault(); onClick(e); });
  return b;
}

// The designs as a row of icon buttons, the current one pressed.
export function designButtons<V extends string>(designs: readonly BlockDesign<V>[], current: V, pick: (v: V) => void): HTMLElement {
  const group = document.createElement('span');
  group.setAttribute('data-block-designs', '');
  for (const d of designs) {
    const b = pillButton(d.label, () => pick(d.id));
    b.setAttribute('data-block-design', d.id);
    b.setAttribute('aria-pressed', String(d.id === current));
    b.innerHTML = d.icon;
    group.append(b);
  }
  return group;
}

// Design ▸ for the block's right-click menu.
export function designMenuItem<V extends string>(designs: readonly BlockDesign<V>[], current: V, pick: (v: V) => void): ContextMenuItem {
  return {
    id: 'block-design',
    label: LABELS.noteBlocks.design,
    icon: '◫',
    submenu: [designs.map((d) => ({ id: `design-${d.id}`, label: d.label, icon: d.id === current ? '✓' : undefined, run: () => pick(d.id) }))],
  };
}

// A small popover beside `anchor` (a block's arrow, icon slot, …), outside the editor so typing in
// it never reaches the document. Closes on Escape (the suite's Escape stack), a press outside it,
// or `close()`; `build` gets that close. Returns close.
export function openBlockPopover(anchor: DOMRect, build: (close: () => void) => HTMLElement): () => void {
  const el = document.createElement('div');
  el.className = styles.popover;
  let closed = false;
  const onDown = (e: MouseEvent) => { if (!el.contains(e.target as Node)) close(); };
  const unregister = registerEscapeClose(() => close());
  function close() {
    if (closed) return;
    closed = true;
    unregister();
    document.removeEventListener('mousedown', onDown, true);
    el.remove();
  }
  el.append(build(close));
  document.body.append(el);
  const width = el.offsetWidth || 240;
  const height = el.offsetHeight || 120;
  const below = window.innerHeight - anchor.bottom > height + 12 || anchor.top < height + 12;
  el.style.left = `${Math.max(8, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8))}px`;
  el.style.top = `${below ? anchor.bottom + 6 : anchor.top - height - 6}px`;
  setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
  return close;
}

export const popoverClass = styles;
