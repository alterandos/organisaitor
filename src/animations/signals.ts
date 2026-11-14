import { useEffect, useRef } from 'react';

// What tells an animation that something happened (2026-11-14): the one place a change happens
// calls `signal(name, id)` (a task restored, a list item made, a checklist item ticked…), and the
// thing on screen for that id listens with `useSignal`. So an animation is started from the change,
// never from each button (CLAUDE.md "Animations"). Plain and dependency-free, so a store or a
// service may call it.
//
// An arrival (`'arrive'`: made, restored, opened) is kept for a moment, because the thing may only
// be drawn after the signal (a new task's row renders after the store change, a note's card after
// the note opens): a row that mounts within ARRIVAL_MS still plays it.

export type SignalName = 'arrive' | 'tick' | 'remove';

const ARRIVAL_MS = 2000;
const listeners = new Map<SignalName, Set<(id: string, detail?: unknown) => void>>();
const pendingArrivals = new Map<string, number>();

export function signal(name: SignalName, id: string, detail?: unknown): void {
  if (name === 'arrive') {
    const now = Date.now();
    // Arrivals nothing drew (a calendar import's events off screen) are let go.
    if (pendingArrivals.size > 100) for (const [k, at] of pendingArrivals) if (now - at > ARRIVAL_MS) pendingArrivals.delete(k);
    pendingArrivals.set(id, now);
  }
  listeners.get(name)?.forEach((fn) => fn(id, detail));
}

export function onSignal(name: SignalName, fn: (id: string, detail?: unknown) => void): () => void {
  let set = listeners.get(name);
  if (!set) listeners.set(name, (set = new Set()));
  set.add(fn);
  return () => { set!.delete(fn); };
}

// An arrival signalled a moment ago for this id, taken (it plays once).
function takeArrival(id: string): boolean {
  const at = pendingArrivals.get(id);
  pendingArrivals.delete(id);
  return at !== undefined && Date.now() - at < ARRIVAL_MS;
}

// Calls `play` when `name` is signalled for `id` (null: never). For an arrival, also on mounting
// just after one. `play` runs on the next frame, once the change is drawn.
export function useSignal(name: SignalName, id: string | null, play: () => void): void {
  const latest = useRef(play);
  useEffect(() => { latest.current = play; });
  useEffect(() => {
    if (!id) return;
    const run = () => requestAnimationFrame(() => latest.current());
    if (name === 'arrive' && takeArrival(id)) run();
    return onSignal(name, (got) => { if (got !== id) return; if (name === 'arrive') pendingArrivals.delete(id); run(); });
  }, [name, id]);
}
