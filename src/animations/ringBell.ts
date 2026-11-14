import { reducedMotion } from './completionBurst';

// A new notification (2026-11-14): the bell rocks and its count pops, so it's noticed without a
// sound. The browser's own Web Animations; reduced motion: nothing.
export function ringBell(button: HTMLElement | null): void {
  if (!button || reducedMotion() || typeof button.animate !== 'function') return;
  button.querySelector('svg')?.animate(
    [{ rotate: '0deg' }, { rotate: '-14deg' }, { rotate: '11deg' }, { rotate: '-6deg' }, { rotate: '0deg' }],
    { duration: 450, easing: 'ease-out' },
  );
  button.querySelector('span')?.animate([{ scale: 0.5 }, { scale: 1.15 }, { scale: 1 }], { duration: 300, easing: 'ease-out' });
}
