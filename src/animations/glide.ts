import { useLayoutEffect, type RefObject } from 'react';
import { reducedMotion } from './completionBurst';

// Something that moved glides from where it was to where it is (2026-11-14: a calendar item given a
// new time, a Runway bar dropped). Each thing on screen keeps its last place by key; when it's
// drawn again with a different `when` (its date and time), it's animated from the old place to the
// new (FLIP), however it was moved (a drag, Postpone, Skip, Undo, another device). The same `when`
// in another place (a scroll, another week, another view) doesn't glide, and nor does a key drawn
// more than once (a repeating event's dates share an id). Reduced motion: no glide.

const last = new Map<string, { when: string; x: number; y: number }>();
const shown = new Map<string, number>();

export function useGlide(key: string, when: string, ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (!key) return;
    shown.set(key, (shown.get(key) ?? 0) + 1);
    return () => { const n = (shown.get(key) ?? 1) - 1; if (n > 0) shown.set(key, n); else shown.delete(key); };
  }, [key]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!key || !el) return;
    if ((shown.get(key) ?? 0) > 1) { last.delete(key); return; }
    const box = el.getBoundingClientRect();
    const prev = last.get(key);
    last.set(key, { when, x: box.left, y: box.top });
    if (!prev || prev.when === when) return;
    const dx = prev.x - box.left;
    const dy = prev.y - box.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    glideFrom(el, dx, dy);
  });
}

// Plays the glide on an element that has just moved by (dx, dy): it starts there and eases home.
// The browser's own Web Animations, not Motion: it writes no style attribute, so ProseMirror (a note
// block's parts glide too) never reads the animation as an edit, and nothing has to load.
export function glideFrom(el: HTMLElement, dx: number, dy: number): void {
  if (reducedMotion() || typeof el.animate !== 'function') return;
  el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
}
