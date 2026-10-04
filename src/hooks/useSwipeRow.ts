import { useEffect, useRef, useState } from 'react';

// Horizontal swipe on a list row (docs/android/11-design-and-coding-patterns.md §5, §9):
// swipe right past the threshold runs the row's positive action (complete a task); swipe left
// past it leaves the row slid open to show its actions (Archive / Delete), which the caller
// renders behind the row, `leftRevealPx` wide. Moved out of TaskItem, which had the first one.
//
// Native, non-passive touchmove: React attaches touch handlers as passive, so preventDefault()
// there is a silent no-op and the list would keep scrolling under a horizontal drag.

export const AXIS_LOCK_PX = 8;
export const SWIPE_THRESHOLD_PX = 70;
// Touches starting this close to either screen edge belong to Android's back gesture (24dp; a
// CSS px is a dp in the WebView).
export const EDGE_EXCLUSION_PX = 24;
// A little give past the revealed actions, so the drag doesn't hit a wall.
const OVERDRAG_PX = 40;

export type SwipeAxis = 'h' | 'v' | null;

// Gesture classification, pure so it can be tested without touch events.

export function startsAtEdge(x: number, viewportWidth: number): boolean {
  return x < EDGE_EXCLUSION_PX || x > viewportWidth - EDGE_EXCLUSION_PX;
}

// Undecided until the finger has moved AXIS_LOCK_PX; horizontal only when clearly so
// (|dx| > 2·|dy|), so a slightly diagonal scroll stays a scroll.
export function lockAxis(dx: number, dy: number): SwipeAxis {
  if (Math.abs(dx) <= AXIS_LOCK_PX && Math.abs(dy) <= AXIS_LOCK_PX) return null;
  return Math.abs(dx) > Math.abs(dy) * 2 ? 'h' : 'v';
}

// Where the row may be dragged to: not right of 0 without a right action, not past the
// revealed actions to the left.
export function clampOffset(offset: number, canSwipeRight: boolean, leftRevealPx: number): number {
  const max = canSwipeRight ? Infinity : 0;
  const min = leftRevealPx > 0 ? -(leftRevealPx + OVERDRAG_PX) : 0;
  return Math.max(min, Math.min(max, offset));
}

export type SwipeOutcome = 'right' | 'reveal' | 'close';

export function swipeOutcome(offset: number, canSwipeRight: boolean, leftRevealPx: number, wasRevealed: boolean): SwipeOutcome {
  if (offset > SWIPE_THRESHOLD_PX && canSwipeRight && !wasRevealed) return 'right';
  if (offset < -SWIPE_THRESHOLD_PX && leftRevealPx > 0) return 'reveal';
  return 'close';
}

export function useSwipeRow<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  { enabled, onSwipeRight, leftRevealPx = 0 }: { enabled: boolean; onSwipeRight?: () => void; leftRevealPx?: number },
) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const onRight = useRef(onSwipeRight);
  useEffect(() => { onRight.current = onSwipeRight; });
  const revealedRef = useRef(false);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  const canSwipeRight = !!onSwipeRight;

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let drag: { x: number; y: number; base: number; offset: number; axis: SwipeAxis } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      const { clientX: x, clientY: y } = e.touches[0];
      if (e.touches.length !== 1 || startsAtEdge(x, window.innerWidth)) { drag = null; return; }
      const base = revealedRef.current ? -leftRevealPx : 0;
      drag = { x, y, base, offset: base, axis: null };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!drag) return;
      const dx = e.touches[0].clientX - drag.x;
      const dy = e.touches[0].clientY - drag.y;
      if (drag.axis === null) drag.axis = lockAxis(dx, dy);
      if (drag.axis !== 'h') return;
      e.preventDefault();
      drag.offset = clampOffset(drag.base + dx, canSwipeRight, leftRevealPx);
      setDragging(true);
      setOffsetX(drag.offset);
    };
    const onTouchEnd = () => {
      const d = drag;
      drag = null;
      if (!d || d.axis !== 'h') return;
      setDragging(false);
      const outcome = swipeOutcome(d.offset, canSwipeRight, leftRevealPx, d.base !== 0);
      if (outcome === 'reveal') { setOffsetX(-leftRevealPx); setRevealed(true); return; }
      setOffsetX(0);
      setRevealed(false);
      if (outcome === 'right') onRight.current?.();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [ref, enabled, canSwipeRight, leftRevealPx]);

  const close = () => { setOffsetX(0); setRevealed(false); };

  return { offsetX, dragging, revealed, close };
}
