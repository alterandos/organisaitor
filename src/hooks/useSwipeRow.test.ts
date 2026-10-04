// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { clampOffset, lockAxis, startsAtEdge, swipeOutcome, useSwipeRow } from './useSwipeRow';

describe('swipe classification', () => {
  it('locks no axis until the finger has moved 8px', () => {
    expect(lockAxis(5, 3)).toBeNull();
    expect(lockAxis(-8, 8)).toBeNull();
  });

  it('is horizontal only when |dx| > 2·|dy|; anything more diagonal is a scroll', () => {
    expect(lockAxis(30, 10)).toBe('h');
    expect(lockAxis(-30, 14)).toBe('h');
    expect(lockAxis(30, 15)).toBe('v');
    expect(lockAxis(2, 20)).toBe('v');
  });

  it('ignores a touch that starts within 24px of either edge (the system back gesture)', () => {
    expect(startsAtEdge(10, 400)).toBe(true);
    expect(startsAtEdge(390, 400)).toBe(true);
    expect(startsAtEdge(24, 400)).toBe(false);
    expect(startsAtEdge(200, 400)).toBe(false);
  });

  it('clamps the drag: no right drag without a right action, a little give past the revealed actions', () => {
    expect(clampOffset(50, false, 160)).toBe(0);
    expect(clampOffset(50, true, 160)).toBe(50);
    expect(clampOffset(-500, true, 160)).toBe(-200);
    expect(clampOffset(-50, true, 0)).toBe(0);
  });

  it('decides the outcome at release', () => {
    expect(swipeOutcome(80, true, 160, false)).toBe('right');
    expect(swipeOutcome(60, true, 160, false)).toBe('close');
    expect(swipeOutcome(-80, true, 160, false)).toBe('reveal');
    expect(swipeOutcome(-80, true, 0, false)).toBe('close');
    // Dragging an already-open row back to the right closes it; it never completes.
    expect(swipeOutcome(80, true, 160, true)).toBe('close');
  });
});

function touch(el: Element, type: string, x = 0, y = 100) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  el.dispatchEvent(e);
  return e;
}

function setup() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const onSwipeRight = vi.fn();
  const hook = renderHook(() => useSwipeRow({ current: el }, { enabled: true, onSwipeRight, leftRevealPx: 160 }));
  return { el, onSwipeRight, hook };
}

describe('useSwipeRow', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = ''; });

  it('a right swipe past the threshold runs the right action and springs back', () => {
    const { el, onSwipeRight, hook } = setup();
    act(() => {
      touch(el, 'touchstart', 100);
      touch(el, 'touchmove', 120);
      touch(el, 'touchmove', 190);
      touch(el, 'touchend');
    });
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(hook.result.current.offsetX).toBe(0);
  });

  it('a left swipe leaves the row open on its actions; a horizontal move cancels the scroll', () => {
    const { el, hook } = setup();
    let move: Event | undefined;
    act(() => {
      touch(el, 'touchstart', 300);
      move = touch(el, 'touchmove', 200);
      touch(el, 'touchend');
    });
    expect(move!.defaultPrevented).toBe(true);
    expect(hook.result.current.revealed).toBe(true);
    expect(hook.result.current.offsetX).toBe(-160);
    act(() => hook.result.current.close());
    expect(hook.result.current.offsetX).toBe(0);
  });

  it('a vertical move is left to the list to scroll', () => {
    const { el, onSwipeRight, hook } = setup();
    let move: Event | undefined;
    act(() => {
      touch(el, 'touchstart', 100, 100);
      move = touch(el, 'touchmove', 110, 160);
      touch(el, 'touchmove', 200, 170);
      touch(el, 'touchend');
    });
    expect(move!.defaultPrevented).toBe(false);
    expect(onSwipeRight).not.toHaveBeenCalled();
    expect(hook.result.current.offsetX).toBe(0);
  });

  it('a swipe that starts at the screen edge does nothing', () => {
    const { el, onSwipeRight } = setup();
    act(() => {
      touch(el, 'touchstart', 5);
      touch(el, 'touchmove', 150);
      touch(el, 'touchend');
    });
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});
