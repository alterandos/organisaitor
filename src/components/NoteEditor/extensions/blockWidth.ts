import type { EditorView } from '@tiptap/pm/view';
import { LABELS } from '@/config/labels';
import type { ContextMenuItem } from '@/contextMenu/types';
import { NOTE_BLOCK_NODES } from '../blockNodes';

// How wide a note block is: one capability for every block that can be resized (adopted 2026-10-26,
// when questions turned out to have no width because it had been built into the Glossary card
// alone). A block takes part with `blockWidthAttributes()` in its attributes, a `blockResizeHandle`
// on its right edge (in its node view, or a widget), its width drawn by `showBlockWidth` (a node
// view) or `blockWidthDomAttrs` (renderHTML), and `widthMenuItem` in its right-click menu; and its
// node name in WIDTH_BLOCK_NODES (pattern test). Today: Glossary cards and questions.
//
// Named widths (Width ▸): Fit the text (`auto`: Standard at least, growing with what's typed up to
// the column), Standard (one width for every card, so cards in a row look alike), a third, half,
// the column. A drag sets any width, as a share of the column (`"42%"`), snapping to the named ones
// and to a quarter and three quarters when it passes close to them (agreed with the user
// 2026-10-22: free, with PowerPoint-style snaps). Unset means the block's own default. A block
// narrower than the column sits beside the next one, as cards in a row do (CSS on
// data-block-width-shown). While a width is dragged, every block's menus step aside
// (`:root[data-block-resizing]`), so the width shown above the handle can be read.

export const WIDTH_BLOCK_NODES = new Set(['glossaryCard', 'questionBlock']);

export const BLOCK_WIDTHS = ['auto', 'standard', 'third', 'half', 'full'] as const;
export type BlockNamedWidth = typeof BLOCK_WIDTHS[number];
export type BlockWidth = BlockNamedWidth | `${number}%`;
export const STANDARD_BLOCK_REM = 26;
const MIN_PCT = 15;
const SNAP = 0.025;   // a share of the column within which a drag snaps
const NAMED_PCT: Record<string, number> = { third: 33, half: 50, full: 100 };

export const percentOf = (w: string) => { const m = /^(\d{1,3})%$/.exec(w); return m ? Math.max(MIN_PCT, Math.min(100, Number(m[1]))) : null; };

// Copies made before 2026-10-26 hold a card's width as data-card-width.
export function blockWidthAttributes() {
  return {
    width: {
      default: null as string | null,
      parseHTML: (el: HTMLElement) => el.getAttribute('data-block-width') ?? el.getAttribute('data-card-width'),
      renderHTML: (a: Record<string, unknown>) => (a.width ? { 'data-block-width': a.width as string } : {}),
    },
  };
}

// The width a block is shown at: its own, else `fallback` (the design's default).
export function blockWidth(attrs: Record<string, unknown>, fallback: BlockNamedWidth): BlockWidth {
  const w = (attrs.width as string | null) ?? '';
  if ((BLOCK_WIDTHS as readonly string[]).includes(w)) return w as BlockWidth;
  const pct = percentOf(w);
  return pct !== null ? `${pct}%` : fallback;
}

// The width a drag ends at, `fraction` being the block's share of the column: a named width or a
// quarter mark when close to one, otherwise the nearest whole percent.
export function snapBlockWidth(fraction: number, columnPx: number, remPx = 16): BlockWidth {
  const stops: [BlockWidth, number][] = [
    ['25%', 1 / 4], ['third', 1 / 3], ['half', 1 / 2], ['75%', 3 / 4], ['full', 1],
    ['standard', Math.min(1, (STANDARD_BLOCK_REM * remPx) / Math.max(1, columnPx))],
  ];
  const near = stops.filter((st) => Math.abs(st[1] - fraction) <= SNAP)
    .sort((a, b) => Math.abs(a[1] - fraction) - Math.abs(b[1] - fraction))[0];
  if (near) return near[0];
  if (fraction >= 1) return 'full';
  return `${Math.max(MIN_PCT, Math.round(fraction * 100))}%`;
}

// The DOM attributes that draw a width: named ones by data-block-width-shown, a percentage
// through --block-w.
export function blockWidthDomAttrs(width: BlockWidth): { 'data-block-width-shown': string; style?: string } {
  const pct = percentOf(width);
  if (pct === null) return { 'data-block-width-shown': width };
  return pct === 100 ? { 'data-block-width-shown': 'full' } : { 'data-block-width-shown': 'custom', style: `--block-w: ${pct}%` };
}

// The same, for a node view that owns its DOM.
export function showBlockWidth(dom: HTMLElement, width: BlockWidth): void {
  const a = blockWidthDomAttrs(width);
  dom.setAttribute('data-block-width-shown', a['data-block-width-shown']);
  if (a.style) dom.style.setProperty('--block-w', `${percentOf(width)}%`); else dom.style.removeProperty('--block-w');
}

export function setBlockWidth(view: EditorView, pos: number, width: BlockWidth, addToHistory = true): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !NOTE_BLOCK_NODES.has(node.type.name) || !('width' in node.attrs)) return;
  const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: width === 'auto' ? null : width });
  if (!addToHistory) tr.setMeta('addToHistory', false);
  view.dispatch(tr);
}

// Width ▸ in a block's right-click menu.
export function widthMenuItem(view: EditorView, pos: number, attrs: Record<string, unknown>, fallback: BlockNamedWidth): ContextMenuItem {
  const L = LABELS.noteBlocks;
  const now = blockWidth(attrs, fallback);
  return {
    id: 'block-width', label: L.width, icon: '↔',
    submenu: [BLOCK_WIDTHS.map((w) => ({
      id: `block-width-${w}`, label: L.widths[w], icon: now === w ? '✓' : undefined,
      run: () => setBlockWidth(view, pos, w),
    }))],
  };
}

// The block's right edge, to drag: any width, snapping near the named ones, with the width it will
// be shown above the handle (in percent, plus the name and the accent colour once it has snapped,
// as design tools show snap feedback). `preview` draws a width while dragging; a node view passes
// its own (showBlockWidth on its DOM). Without one, the width changes live in changes that aren't
// undo steps, and the drag ends in one undo step from where it started.
export function blockResizeHandle(
  viewOf: () => EditorView,
  blockPos: () => number | undefined,
  fallback: () => BlockNamedWidth,
  preview?: (width: BlockWidth) => void,
): HTMLElement {
  const h = document.createElement('div');
  h.setAttribute('data-block-resize', '');
  h.title = LABELS.noteBlocks.resize;
  h.contentEditable = 'false';
  h.addEventListener('mousedown', (e) => e.preventDefault());
  h.addEventListener('pointerdown', (e) => {
    const view = viewOf();
    const block = h.closest<HTMLElement>('[data-note-block]');
    const column = block?.parentElement;
    const start = blockPos();
    const node = start === undefined ? null : view.state.doc.nodeAt(start);
    if (!view.editable || !block || !column || !node) return;
    e.preventDefault();
    e.stopPropagation();
    h.setPointerCapture(e.pointerId);
    document.documentElement.setAttribute('data-block-resizing', '');
    const original = node.attrs.width as string | null;
    const left = block.getBoundingClientRect().left;
    const columnPx = column.getBoundingClientRect().width;
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const W = LABELS.noteBlocks.widths as Record<string, string>;
    const stdPct = Math.round(Math.min(1, (STANDARD_BLOCK_REM * remPx) / Math.max(1, columnPx)) * 100);
    let width = blockWidth(node.attrs, fallback());
    // The block's place, read once: a width change doesn't move it, and a block drawn by renderHTML
    // (the question) is redrawn by each change, the handle with it, so its getPos can't be asked.
    const at = start as number;
    const draw = preview ?? ((w: BlockWidth) => setBlockWidth(view, at, w, false));
    const move = (ev: PointerEvent) => {
      width = snapBlockWidth((ev.clientX - left) / columnPx, columnPx, remPx);
      draw(width);
      const pct = percentOf(width) ?? NAMED_PCT[width] ?? stdPct;
      const named = W[width];
      h.setAttribute('data-label', named ? `${pct}% · ${named}` : `${pct}%`);
      if (named || pct === 25 || pct === 75) h.setAttribute('data-snapped', ''); else h.removeAttribute('data-snapped');
    };
    const up = () => {
      document.documentElement.removeAttribute('data-block-resizing');
      h.removeAttribute('data-label');
      h.removeAttribute('data-snapped');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const n = view.state.doc.nodeAt(at);
      if (!n || n.type !== node.type) return;
      if (!preview) view.dispatch(view.state.tr.setNodeMarkup(at, undefined, { ...n.attrs, width: original }).setMeta('addToHistory', false));
      setBlockWidth(view, at, width);
    };
    // On the window, not the handle: a block redrawn mid-drag takes this handle (and its pointer
    // capture) out of the page, and a release it never heard left the drag running for good
    // (found 2026-10-27 on the question: the resize cursor and label stuck).
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  return h;
}
