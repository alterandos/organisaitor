// The arithmetic behind a note picture's resize and crop handles (ResizableImage.ts), kept pure
// so it can be tested without a browser.

// How much is cut from each side, as a fraction of the whole picture.
export interface Crop { top: number; right: number; bottom: number; left: number }

export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w';

export const NO_CROP: Crop = { top: 0, right: 0, bottom: 0, left: 0 };
export const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se'];
export const EDGES: Handle[] = ['n', 'e', 's', 'w'];

const MIN_PX = 40;           // smallest a picture can be dragged to
const MIN_CROP_SHOWN = 0.05; // the least of the picture a crop leaves showing, each way

const xSign = (h: Handle) => (h.includes('e') ? 1 : h.includes('w') ? -1 : 0);
const ySign = (h: Handle) => (h.includes('s') ? 1 : h.includes('n') ? -1 : 0);

export const isCropped = (c: Crop | null | undefined) => !!c && (c.top > 0 || c.right > 0 || c.bottom > 0 || c.left > 0);

export function parseCrop(raw: string | null): Crop {
  const parts = (raw ?? '').split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n >= 1)) return { ...NO_CROP };
  const [top, right, bottom, left] = parts;
  if (left + right >= 1 || top + bottom >= 1) return { ...NO_CROP };
  return { top, right, bottom, left };
}

export const serializeCrop = (c: Crop) => [c.top, c.right, c.bottom, c.left].map((n) => +n.toFixed(4)).join(',');

// Dragging a resize handle by (dx, dy) from a picture shown at w × h. A corner keeps the shape
// (following whichever way the pointer moved further); an edge stretches one way only, after
// which the picture remembers its own height (stretched).
export function resizeDrag(
  handle: Handle, start: { w: number; h: number }, dx: number, dy: number, stretched: boolean,
): { width: number; height: number; stretched: boolean } {
  const sx = xSign(handle);
  const sy = ySign(handle);
  if (sx && sy) {
    const rx = (sx * dx) / start.w;
    const ry = (sy * dy) / start.h;
    const scale = Math.max(MIN_PX / Math.min(start.w, start.h), 1 + (Math.abs(rx) > Math.abs(ry) ? rx : ry));
    return { width: start.w * scale, height: start.h * scale, stretched };
  }
  if (sx) return { width: Math.max(MIN_PX, start.w + sx * dx), height: start.h, stretched: true };
  return { width: start.w, height: Math.max(MIN_PX, start.h + sy * dy), stretched: true };
}

// Dragging a crop handle by a fraction of the whole picture (dx of its width, dy of its height).
// Each side moves on its own, as in a word processor; a crop always leaves some of the picture.
export function cropDrag(handle: Handle, start: Crop, dx: number, dy: number): Crop {
  const c = { ...start };
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  if (handle.includes('w')) c.left = clamp(start.left + dx, 1 - start.right - MIN_CROP_SHOWN);
  if (handle.includes('e')) c.right = clamp(start.right - dx, 1 - start.left - MIN_CROP_SHOWN);
  if (handle.includes('n')) c.top = clamp(start.top + dy, 1 - start.bottom - MIN_CROP_SHOWN);
  if (handle.includes('s')) c.bottom = clamp(start.bottom - dy, 1 - start.top - MIN_CROP_SHOWN);
  return c;
}
