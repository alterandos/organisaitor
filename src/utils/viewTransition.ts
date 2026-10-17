import { flushSync } from 'react-dom';

// Animating a change of what's on screen with the browser's View Transitions (no library):
// `change` runs inside document.startViewTransition, flushed so React draws it at once, and the
// browser morphs the old picture into the new. `kind` names the animation (data-view-transition
// on <html>, matched by the ::view-transition rules in index.css). Without support, or with
// reduced motion, the change just happens.
export type ViewTransitionKind = 'zoom-in' | 'zoom-out' | 'switch';

export function withViewTransition(kind: ViewTransitionKind, change: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced) { change(); return; }
  const root = document.documentElement;
  root.dataset.viewTransition = kind;
  const t = doc.startViewTransition(() => flushSync(change));
  t.finished.catch(() => { /* a transition the browser skips rejects `finished`: nothing to undo */ }).finally(() => { if (root.dataset.viewTransition === kind) delete root.dataset.viewTransition; });
}
