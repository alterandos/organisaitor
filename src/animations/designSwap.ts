import { reducedMotion } from './completionBurst';

// A note block's design changed (2026-11-14: Ctrl+] / Ctrl+[, the pill's design buttons): the new
// design fades in over the old place, a short crossfade, so the change reads as the same block
// redrawn. Found again after the change by its place on screen (ProseMirror may draw the block
// afresh). The browser's own Web Animations (nothing written to the editor's DOM). Not for a block
// taller than the window (it reads as a flicker); reduced motion: nothing.

export function designSwap(block: Element | null | undefined): void {
  if (!block || reducedMotion()) return;
  const r = block.getBoundingClientRect();
  if (!r.width || r.height > window.innerHeight) return;
  const x = r.left + Math.min(r.width / 2, 40);
  const y = r.top + Math.min(r.height / 2, 30);
  requestAnimationFrame(() => {
    const now = document.elementFromPoint?.(x, y)?.closest('[data-note-block]');
    if (!(now instanceof HTMLElement) || typeof now.animate !== 'function') return;
    now.animate([{ opacity: 0.25, scale: 0.99 }, { opacity: 1, scale: 1 }], { duration: 180, easing: 'ease-out' });
  });
}
