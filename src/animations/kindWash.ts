import { reducedMotion } from './completionBurst';

// A Glossary record's kind changed (2026-11-14): every card of it starts tinted in its old kind's
// colour and the tint washes away as its new colour takes over, so the change is seen on each
// card. Call with the change: the old colours are read first. Web Animations only (the cards
// live in a note's editor); reduced motion: nothing.

const tint = (colour: string) => (/^#[0-9a-f]{6}$/i.test(colour) ? `${colour}40` : colour);

export function kindWash(entryId: string, change: () => void): void {
  const cards = () => Array.from(document.querySelectorAll<HTMLElement>(`[data-entry-id="${CSS.escape(entryId)}"]`));
  const before = typeof document === 'undefined' || reducedMotion() ? [] : cards().map((el) => getComputedStyle(el).getPropertyValue('--color-primary').trim());
  change();
  if (!before.length) return;
  requestAnimationFrame(() => cards().forEach((el, i) => {
    const old = before[i] ?? before[0];
    if (!old || typeof el.animate !== 'function') return;
    el.animate([{ boxShadow: `inset 0 0 0 100vmax ${tint(old)}` }, { boxShadow: 'inset 0 0 0 100vmax transparent' }], { duration: 450, easing: 'ease-out' });
  }));
}
