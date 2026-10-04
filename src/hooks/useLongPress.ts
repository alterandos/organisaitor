import { useEffect, useRef } from 'react';
import { hapticMedium } from '@/utils/haptics';
import styles from './useLongPress.module.css';

// Long-press = "more for this item" on a phone (docs/android/11-design-and-coding-patterns.md §5,
// decision D1). Hold a finger still for LONG_PRESS_MS: haptic, then onLongPress. Moving more than
// LONG_PRESS_MOVE_TOLERANCE_PX first cancels it, so scrolling a list never opens anything. The
// click the release would produce is swallowed, so the row's tap action doesn't also run.
//
// Native listeners, not React's: the contextmenu that Android raises on a long touch has to be
// cancelled on the element itself, and the swallowed click must be caught in the capture phase
// before any React handler sees it. Touch only: a mouse has hover.

export const LONG_PRESS_MS = 450;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
// How long after the release a click still counts as "the click this long-press produced".
const CLICK_SUPPRESS_MS = 400;

export function useLongPress<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onLongPress: () => void,
  enabled = true,
) {
  const callback = useRef(onLongPress);
  useEffect(() => { callback.current = onLongPress; });

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let fired = false;

    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      start = null;
    };

    const suppressNextClick = () => {
      const swallow = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener('click', swallow, true);
      };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), CLICK_SUPPRESS_MS);
    };

    const onTouchStart = (e: TouchEvent) => {
      cancel();
      fired = false;
      if (e.touches.length !== 1) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        hapticMedium();
        callback.current();
      }, LONG_PRESS_MS);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!start || !timer) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) cancel();
    };
    const onTouchEnd = () => {
      cancel();
      if (fired) suppressNextClick();
      fired = false;
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    el.classList.add(styles.target);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      cancel();
      el.classList.remove(styles.target);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', cancel);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [ref, enabled]);
}
