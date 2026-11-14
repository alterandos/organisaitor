import { useEffect, useRef, useState } from 'react';
import styles from './settle.module.css';
import { onSignal } from './signals';

// Something just done stays where it was for a moment, then folds away (2026-11-13). Completing a
// task moved it into the collapsed Completed group in the same frame, so its tick was never seen
// and the completion burst (completionBurst.ts) popped a checkbox that was already gone. Now the
// row stays, ticked and struck through, while the burst plays, then leaves (`leaving`, CSS; with
// reduced motion it simply goes when the moment is up). Generic: give it the change to listen to.

export const SETTLE_MS = 900;
export const leavingClass = styles.leaving;

export function useSettling(subscribe: (fn: (id: string) => void) => () => void): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const off = subscribe((id) => {
      setIds((s) => new Set(s).add(id));
      const t = setTimeout(() => {
        timers.current.delete(t);
        setIds((s) => { const n = new Set(s); n.delete(id); return n; });
      }, SETTLE_MS);
      timers.current.add(t);
    });
    const pending = timers.current;
    return () => { off(); pending.forEach(clearTimeout); pending.clear(); };
  }, [subscribe]);
  return ids;
}

// Loads the animation library ahead of the first animation (the pointer reaching a checkbox), so
// the first completion doesn't wait for it. Still never in the first load.
let warmed = false;
export function warmAnimations(): void {
  if (warmed) return;
  warmed = true;
  void import('./motionLib').catch(() => { warmed = false; });
}

// Something removed stays a moment as it was, folding away (`leavingClass`), rather than vanishing
// and letting everything below jump up (2026-11-14: a task swiped away). The change has already
// happened (it's gone from its store); the list draws the copy signalled with it
// (`signal('remove', id, item)`, animations/signals.ts) for SETTLE_MS.
export function useLeaving<T>(): ReadonlyMap<string, T> {
  const [items, setItems] = useState<ReadonlyMap<string, T>>(() => new Map());
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = onSignal('remove', (id, detail) => {
      if (!detail) return;
      setItems((m) => new Map(m).set(id, detail as T));
      const t = setTimeout(() => { timers.delete(t); setItems((m) => { const n = new Map(m); n.delete(id); return n; }); }, SETTLE_MS);
      timers.add(t);
    });
    return () => { off(); timers.forEach(clearTimeout); };
  }, []);
  return items;
}
