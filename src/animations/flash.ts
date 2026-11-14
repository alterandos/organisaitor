import { reducedMotion } from './completionBurst';

// Something that just appeared, came back, or was gone to (2026-11-14: a new task, an Undo, a
// card opened from a link) glows once in its place, so the eye finds it. Brought into view first
// if it's off screen. The browser's own Web Animations (no class or style written, so a note's
// blocks glow without ProseMirror reading it as an edit); the ring and shade are theme tokens. With
// reduced motion the glow stays and nothing moves.

export function flashArrival(el: Element | null | undefined): void {
  if (!(el instanceof HTMLElement) || !el.isConnected) return;
  const box = el.getBoundingClientRect();
  if (box.bottom < 0 || box.top > window.innerHeight) el.scrollIntoView?.({ block: 'center' });
  if (typeof el.animate !== 'function') return;
  const css = getComputedStyle(document.documentElement);
  const ring = css.getPropertyValue('--color-primary-border').trim();
  const shade = css.getPropertyValue('--color-primary-subtle').trim();
  el.animate([
    { boxShadow: `0 0 0 3px ${ring}, inset 0 0 0 100vmax ${shade}`, offset: 0 },
    { boxShadow: `0 0 0 3px ${ring}, inset 0 0 0 100vmax ${shade}`, offset: 0.25 },
    { boxShadow: '0 0 0 0 transparent, inset 0 0 0 100vmax transparent' },
  ], { duration: 900, easing: 'ease-out' });
  if (!reducedMotion()) el.animate([{ translate: '0 4px' }, { translate: '0 0' }], { duration: 200, easing: 'ease-out' });
}

// What glows when a note is opened at a passage: the block it's in (a card, a timeline…), else
// its line (a paragraph, a heading, a list item).
export function passageElement(view: { domAtPos: (pos: number) => { node: Node } }, pos: number): HTMLElement | null {
  let node: Node;
  try { node = view.domAtPos(pos).node; } catch { return null; }   // not laid out
  const el = node instanceof HTMLElement ? node : node.parentElement;
  return (el?.closest('[data-note-block]') ?? el?.closest('p, li, h1, h2, h3, h4, h5, h6')) as HTMLElement | null;
}
