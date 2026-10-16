import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

// THE way to place a floating panel (a dropdown, picker, popover, hover card or menu) next to what
// opened it, so the whole panel is always reachable (adopted 2026-10-17, after the backdrop picker
// opened with its bottom off the screen). The usual practice (Floating UI's offset → flip → shift
// → size, and the platform menu guidelines):
//   1. Put it on its preferred side (below, or beside for a submenu).
//   2. Flip to the other side if it fits there and not here.
//   3. Fits neither: the roomier side, with a max-height, and it scrolls INSIDE (the panel's CSS
//      gives it `overflow-y: auto`, or scrolls its own list). Never off screen, never the page.
//   4. Sideways (or up and down, beside) it is shifted to stay inside the window.

export interface AnchorBox { left: number; top: number; right: number; bottom: number }
export interface FloatingPlacement { left: number; top: number; maxHeight: number }
export interface FloatingOptions {
  gap?: number;                          // between the anchor and the panel
  margin?: number;                       // kept clear at the window's edges
  // below: under the anchor (or over it); its left edge, middle or right edge on the anchor's.
  // beside: to the anchor's right (or its left), top edges level: a submenu.
  align?: 'start' | 'center' | 'end';
  placement?: 'below' | 'beside';
}

export function placeFloating(
  anchor: AnchorBox,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  { gap = 8, margin = 8, align = 'start', placement = 'below' }: FloatingOptions = {},
): FloatingPlacement {
  const shift = (v: number, length: number, room: number) => Math.max(margin, Math.min(v, room - length - margin));

  if (placement === 'beside') {
    const right = viewport.width - anchor.right - gap - margin;
    const leftRoom = anchor.left - gap - margin;
    const onRight = size.width <= right || (size.width > leftRoom && right >= leftRoom);
    const left = onRight ? anchor.right + gap : anchor.left - gap - size.width;
    const maxHeight = Math.max(0, viewport.height - 2 * margin);
    return { left: Math.max(margin, left), top: shift(anchor.top, Math.min(size.height, maxHeight), viewport.height), maxHeight };
  }

  const below = viewport.height - anchor.bottom - gap - margin;
  const above = anchor.top - gap - margin;
  let top: number;
  let maxHeight: number;
  // Below if it fits there, or if it fits neither way and below is the roomier side.
  if (size.height <= below || (size.height > above && below >= above)) {
    top = anchor.bottom + gap;
    maxHeight = Math.max(0, below);
  } else {
    maxHeight = Math.max(0, above);
    top = anchor.top - gap - Math.min(size.height, maxHeight);
  }
  let wanted = align === 'center' ? (anchor.left + anchor.right) / 2 - size.width / 2
    : align === 'end' ? anchor.right - size.width
    : anchor.left;
  // Running off the right: line its right edge up with the anchor's instead (a menu at a click
  // opens to the left of it), before shifting.
  if (align === 'start' && wanted + size.width > viewport.width - margin && anchor.right - size.width >= margin) wanted = anchor.right - size.width;
  return { left: shift(wanted, size.width, viewport.width), top: Math.max(margin, top), maxHeight };
}

// Its size, borders included, as if only its own CSS max-height (a list kept short on purpose)
// were cutting it short; and that cap. The inline max-height placing put on it is set aside while
// measuring, then put back.
function measureEl(el: HTMLElement): { size: { width: number; height: number }; cap: number } {
  const inline = el.style.maxHeight;
  el.style.maxHeight = '';
  const css = parseFloat(getComputedStyle(el).maxHeight);
  const cap = Number.isFinite(css) ? css : Infinity;
  const size = { width: el.offsetWidth, height: Math.min(cap, el.scrollHeight + el.offsetHeight - el.clientHeight) };
  el.style.maxHeight = inline;
  return { size, cap };
}

// For a plain-DOM panel (a ProseMirror widget's popover, the `//` list): already in the document,
// position: fixed. Sets its left, top and max-height.
export function placeElement(el: HTMLElement, anchor: AnchorBox, options: FloatingOptions = {}): void {
  const { size, cap } = measureEl(el);
  const p = placeFloating(anchor, size, { width: window.innerWidth, height: window.innerHeight }, options);
  el.style.left = `${p.left}px`;
  el.style.top = `${p.top}px`;
  el.style.maxHeight = `${Math.min(cap, p.maxHeight)}px`;
}

// For a React panel (position: fixed): put `ref` on it and `style` in its style. It is measured
// after every render and whenever its size changes (pictures loading), and placed again on a
// window resize; until the first measurement it is hidden, so it never flashes in the wrong place.
export function useFloatingPlacement<T extends HTMLElement>(anchor: AnchorBox | null, options: FloatingOptions = {}) {
  const ref = useRef<T>(null);
  const [place, setPlace] = useState<FloatingPlacement | null>(null);
  const { gap, margin, align, placement } = options;

  const measure = () => {
    const el = ref.current;
    if (!el || !anchor) return;
    const { size, cap } = measureEl(el);
    const p = placeFloating(anchor, size, { width: window.innerWidth, height: window.innerHeight }, { gap, margin, align, placement });
    const next = { ...p, maxHeight: Math.min(cap, p.maxHeight) };
    setPlace((p) => (p && p.left === next.left && p.top === next.top && p.maxHeight === next.maxHeight ? p : next));
  };
  const measureRef = useRef(measure);
  const watching = useRef<{ el: HTMLElement; stop: () => void } | null>(null);
  // After every render, so new content (a section appearing) is placed at once; setPlace keeps
  // the same object when nothing moved, so this settles after one pass. The panel may mount and
  // unmount while the component holding the hook stays (a dropdown), so what's watched for size
  // changes follows whatever element the ref holds now.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render on purpose; setPlace is guarded
  useLayoutEffect(() => {
    measureRef.current = measure;
    const el = ref.current;
    if ((watching.current?.el ?? null) !== el) {
      watching.current?.stop();
      watching.current = null;
      if (el) {
        const again = () => measureRef.current();
        // Not everywhere (jsdom): then only a render or a window resize places it again.
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(again);
        observer?.observe(el);
        window.addEventListener('resize', again);
        watching.current = { el, stop: () => { observer?.disconnect(); window.removeEventListener('resize', again); } };
      } else setPlace(null);
    }
    measure();
  });
  useLayoutEffect(() => () => watching.current?.stop(), []);

  const style: CSSProperties = place
    ? { left: place.left, top: place.top, maxHeight: place.maxHeight }
    : { left: anchor?.left ?? 0, top: anchor?.bottom ?? 0, visibility: 'hidden' };
  return { ref, style };
}
