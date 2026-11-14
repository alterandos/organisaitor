import styles from './tickPop.module.css';
import { onSignal } from './signals';
import { completionBurst, reducedMotion } from './completionBurst';

// A tick on a checklist item or a routine's step (2026-11-14): its box pops on a spring and its
// text's strike-through is drawn across. Whatever can be ticked marks its box `data-tick="<id>"`
// (and its text `data-tick-text`, inside the same `data-tick-row`); the change that ticks it calls
// `signal('tick', id)` (routineStore, services/taskListLinks.ts). One listener for the whole app,
// installed once (App.tsx). A box marked `data-tick-burst` (a routine finished) also gets the
// completion burst. Reduced motion: nothing.

export function installTickPop(): () => void {
  return onSignal('tick', (id) => {
    requestAnimationFrame(() => {
      for (const el of document.querySelectorAll<HTMLElement>(`[data-tick="${CSS.escape(id)}"]`)) void tickPop(el);
    });
  });
}

export async function tickPop(box: HTMLElement): Promise<void> {
  if (!box.isConnected || reducedMotion()) return;
  if (box.hasAttribute('data-tick-burst')) void completionBurst(box);
  const text = box.closest('[data-tick-row]')?.querySelector<HTMLElement>('[data-tick-text]');
  if (text) {
    text.classList.add(styles.drawStrike);
    text.addEventListener('animationend', () => text.classList.remove(styles.drawStrike), { once: true });
  }
  const { animate } = await import('./motionLib');
  if (box.isConnected) animate(box, { scale: [0.7, 1] }, { type: 'spring', stiffness: 600, damping: 11 });
}
