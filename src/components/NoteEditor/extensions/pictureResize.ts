import { type Handle, resizeDrag, snapSize } from './imageGeometry';
import styles from './ResizableImage.module.css';

// Resizing a picture: the handles and the drag, shared by a note's picture (ResizableImage.ts) and
// a Glossary card's (GlossaryCardBody ImageField), so the two look and behave the same (asked for
// by the user 2026-11-11: the card had a handle of its own). A corner keeps the picture's shape, an
// edge stretches it one way (imageGeometry.ts resizeDrag); the size snaps to the note's other
// pictures and to the column (snapSize), the pictures it matches outlined while it does. A place
// that keeps only a width offers the corners alone.

// On what's being resized, while it is.
export const PICTURE_RESIZING_CLASS = styles.resizing;

export interface PictureSize { width: number; height: number; stretched: boolean }

// The handles, laid over the picture (their container fills its positioned parent). Shown while
// the picture is selected (the note's .selected), or with `showOnHover`, while it's hovered and
// always on touch (a card's, which has no selection of its own).
export function pictureHandles(which: readonly Handle[], onDown: (e: PointerEvent, h: Handle) => void, opts: { showOnHover?: boolean; label?: string } = {}): HTMLElement {
  const box = document.createElement('span');
  box.className = opts.showOnHover ? `${styles.handles} ${styles.handlesOnHover}` : styles.handles;
  for (const h of which) {
    const knob = document.createElement('span');
    knob.className = `${styles.handle} ${styles[`h_${h}`]}`;
    knob.dataset.handle = h;
    if (opts.label) { knob.title = opts.label; knob.setAttribute('aria-label', opts.label); knob.setAttribute('role', 'separator'); }
    knob.addEventListener('pointerdown', (e) => onDown(e, h));
    box.appendChild(knob);
  }
  return box;
}

export interface ResizeOptions {
  // The visible picture, measured at the start.
  picture:   HTMLElement;
  // Where the other pictures to snap to are (the editor), and the element outlined with them.
  within:    HTMLElement | null;
  frame?:    HTMLElement;
  // The widest it may be, which it also snaps to (the column, the card), in CSS pixels.
  column:    number;
  stretched: boolean;
  onMove:    (size: PictureSize) => void;
  onDone:    (size: PictureSize) => void;
}

// Follows a drag of a handle from its pointerdown to its release (pointer capture, so it keeps
// working off the picture and with touch). Returns a function that stops it early.
export function resizePicture(e: PointerEvent, handle: Handle, o: ResizeOptions): () => void {
  e.preventDefault();
  e.stopPropagation();
  // The editor can be zoomed (CSS zoom): the screen measures zoomed pixels, while a picture's
  // size is stored and drawn in CSS pixels. Everything here is worked in CSS pixels.
  const rect = o.picture.getBoundingClientRect();
  const zoom = rect.width / (o.picture.offsetWidth || rect.width) || 1;
  const css = (px: number) => px / zoom;
  const start = { x: e.clientX, y: e.clientY, w: css(rect.width), h: css(rect.height) };
  let result: PictureSize = { width: start.w, height: start.h, stretched: o.stretched };
  const outlined = o.frame ?? o.picture;
  const others = o.within ? Array.from(o.within.querySelectorAll<HTMLElement>(`.${styles.frame}`)).filter((f) => f !== outlined) : [];
  const sizeOf = (f: HTMLElement) => { const r = f.getBoundingClientRect(); return { w: Math.round(css(r.width)), h: Math.round(css(r.height)) }; };
  const sizes = others.map(sizeOf);
  const column = Math.round(o.column);
  const targets = { widths: [...sizes.map((s) => s.w), column].filter((w) => w > 0), heights: sizes.map((s) => s.h).filter((h) => h > 0) };
  const clearMatches = () => { for (const f of [...others, outlined]) f.classList.remove(styles.sizeMatch); };
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    ev.preventDefault();
    const dragged = resizeDrag(handle, start, css(ev.clientX - start.x), css(ev.clientY - start.y), o.stretched);
    const snap = snapSize(handle, dragged, targets);
    result = { ...dragged, width: snap.width, height: snap.height };
    if (column > 0 && result.width > column) result = { ...result, height: result.height * (column / result.width), width: column };
    clearMatches();
    if (snap.snapped) {
      // The pictures it now matches are outlined with it, as a design tool's guides show.
      outlined.classList.add(styles.sizeMatch);
      others.forEach((f, i) => {
        const v = snap.snapped === 'width' ? sizes[i].w : sizes[i].h;
        if (Math.abs(v - (snap.snapped === 'width' ? snap.width : snap.height)) <= 1) f.classList.add(styles.sizeMatch);
      });
    }
    o.onMove(result);
  };
  const stop = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
  };
  const up = () => { stop(); clearMatches(); o.onDone(result); };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  return () => { stop(); clearMatches(); };
}
