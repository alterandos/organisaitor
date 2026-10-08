import { describe, expect, it } from 'vitest';
import { NO_CROP, cropDrag, isCropped, parseCrop, resizeDrag, serializeCrop } from './imageGeometry';

const start = { w: 400, h: 200 };

describe('resizing a picture', () => {
  it('a corner keeps its shape, following whichever way the pointer moved further', () => {
    expect(resizeDrag('se', start, 100, 10, false)).toEqual({ width: 500, height: 250, stretched: false });
    expect(resizeDrag('se', start, 10, 100, false)).toEqual({ width: 600, height: 300, stretched: false });
    // The left and top handles grow the picture when dragged out (left / up).
    expect(resizeDrag('nw', start, -100, 0, false)).toEqual({ width: 500, height: 250, stretched: false });
  });

  it('an edge stretches one way only, and from then on the picture keeps its own height', () => {
    expect(resizeDrag('e', start, 100, 50, false)).toEqual({ width: 500, height: 200, stretched: true });
    expect(resizeDrag('n', start, 0, -50, false)).toEqual({ width: 400, height: 250, stretched: true });
    expect(resizeDrag('se', start, 100, 0, true).stretched).toBe(true);
  });

  it('never shrinks below a usable size', () => {
    expect(resizeDrag('w', start, 1000, 0, false).width).toBe(40);
    expect(resizeDrag('se', start, -1000, -1000, false)).toEqual({ width: 80, height: 40, stretched: false });
  });
});

describe('cropping a picture', () => {
  it('each handle moves its own sides', () => {
    expect(cropDrag('w', NO_CROP, 0.2, 0.5)).toEqual({ ...NO_CROP, left: 0.2 });
    expect(cropDrag('se', NO_CROP, -0.1, -0.3)).toEqual({ ...NO_CROP, right: 0.1, bottom: 0.3 });
    expect(cropDrag('n', { ...NO_CROP, top: 0.3 }, 0, -0.5)).toEqual(NO_CROP);   // can be widened back to the whole picture
  });

  it('always leaves some of the picture showing', () => {
    const c = cropDrag('e', { ...NO_CROP, left: 0.5 }, -2, 0);
    expect(1 - c.left - c.right).toBeCloseTo(0.05);
  });

  it('round-trips through the HTML attribute, and ignores nonsense', () => {
    const c = { top: 0.1, right: 0.2, bottom: 0, left: 0.33333 };
    expect(parseCrop(serializeCrop(c))).toEqual({ ...c, left: 0.3333 });
    expect(parseCrop('0.6,0,0.6,0')).toEqual(NO_CROP);
    expect(parseCrop(null)).toEqual(NO_CROP);
    expect(isCropped(NO_CROP)).toBe(false);
    expect(isCropped(c)).toBe(true);
  });
});
