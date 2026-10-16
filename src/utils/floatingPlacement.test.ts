import { describe, expect, it } from 'vitest';
import { placeFloating } from './floatingPlacement';

const VIEW = { width: 1000, height: 800 };
const anchorAt = (top: number, left = 100) => ({ left, top, right: left + 40, bottom: top + 40 });

describe('placeFloating: the whole panel is on screen', () => {
  it('goes below the anchor when it fits there', () => {
    expect(placeFloating(anchorAt(100), { width: 300, height: 400 }, VIEW)).toEqual({ left: 100, top: 148, maxHeight: 644 });
  });

  it('goes above when it does not fit below but does above', () => {
    const p = placeFloating(anchorAt(600), { width: 300, height: 400 }, VIEW);
    expect(p.top).toBe(600 - 8 - 400);
    expect(p.top + 400).toBeLessThanOrEqual(600);
  });

  it('fits neither way: the roomier side, capped so its bottom is reachable', () => {
    // The backdrop picker's bug: a tall panel opened below an anchor low on the screen.
    const p = placeFloating(anchorAt(500), { width: 300, height: 900 }, VIEW);
    expect(p).toEqual({ left: 100, top: 8, maxHeight: 484 });
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(500 - 8);
    const q = placeFloating(anchorAt(200), { width: 300, height: 900 }, VIEW);
    expect(q.top).toBe(248);
    expect(q.top + q.maxHeight).toBeLessThanOrEqual(VIEW.height - 8);
  });

  it('is kept inside the window sideways, and centres on the anchor when asked', () => {
    // Running off the right: its right edge lines up with the anchor's (a menu at a click opens leftwards).
    expect(placeFloating(anchorAt(100, 900), { width: 300, height: 100 }, VIEW).left).toBe(940 - 300);
    // No room that way either: shifted inside the window.
    expect(placeFloating(anchorAt(100, 900), { width: 990, height: 100 }, VIEW).left).toBe(8);
    expect(placeFloating(anchorAt(100, 0), { width: 300, height: 100 }, VIEW, { align: 'center' }).left).toBe(8);
    expect(placeFloating(anchorAt(100, 400), { width: 300, height: 100 }, VIEW, { align: 'center' }).left).toBe(270);
    expect(placeFloating(anchorAt(100, 400), { width: 300, height: 100 }, VIEW, { align: 'end' }).left).toBe(140);
  });

  it('beside (a submenu): to the right, else the left; shifted up to fit; capped to the window', () => {
    const item = { left: 300, right: 500, top: 700, bottom: 730 };
    expect(placeFloating(item, { width: 200, height: 300 }, VIEW, { placement: 'beside', gap: 0 })).toEqual({ left: 500, top: 800 - 8 - 300, maxHeight: 784 });
    expect(placeFloating({ ...item, left: 700, right: 900 }, { width: 200, height: 300 }, VIEW, { placement: 'beside', gap: 0 }).left).toBe(500);
    expect(placeFloating(item, { width: 200, height: 2000 }, VIEW, { placement: 'beside', gap: 0 }).top).toBe(8);
  });
});
