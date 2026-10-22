import { useEffect, useRef } from 'react';

// THE Escape-key rule for the whole suite: Escape closes the most recently opened overlay, and
// only that one. Every modal, slide-in pane, dialog, popover and dropdown registers here while
// it is open instead of adding its own document keydown listener.
//
// Why a stack and not per-component listeners: two independent `document` listeners both fire
// on the same keypress, in whatever order they happened to be registered — so an overlay opened
// *on top of* another (a delete confirmation over a pane, a picker inside a modal) can't be
// given priority, and a single Escape closed both. Here there is exactly one listener; it hands
// the event to the last-registered entry and to nothing else (stopImmediatePropagation also keeps
// any stray listener that hasn't been migrated from double-handling it).
//
// "Most recently opened" = most recently *registered* (effect order), which is exactly the
// order the user opened them in. Registration depends only on `active`, never on `onClose`, so
// re-renders and a changing callback identity can't reshuffle the order — the latest callback is
// always the one called.
//
// Inline, input-level Escape handlers (cancel an in-place edit, dismiss a suggestions list)
// still work as ordinary onKeyDown handlers, but must call `e.stopPropagation()` so the same
// keypress doesn't also reach this stack and close the pane around the input.

// `docked`: a panel beside the page rather than over it (Calendar's side pane): Escape still
// closes it, but it doesn't stop the page's own keys (hasOpenOverlay ignores it).
// `when`: asked at the moment Escape is pressed; an overlay that answers false is passed over this
// time, and the next one down takes it. For an overlay that stays open while the person works
// somewhere else (the note's selection toolbar while the scratchpad is being typed in, found
// 2026-10-22: Escape went to the toolbar and the scratchpad never closed).
interface Entry { handler: { current: () => void }; docked?: boolean; when?: { current: (() => boolean) | undefined } }
type Opts = { docked?: boolean; when?: () => boolean };

const stack: Entry[] = [];
const topEntry = () => {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].when?.current?.() ?? true) return stack[i];
  return undefined;
};

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
  const top = topEntry();
  if (!top) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  top.handler.current();
}

// The Android back button (App.tsx) uses the same stack: back closes exactly what Escape would.
// Returns whether there was an overlay to close.
export function closeTopOverlay(): boolean {
  const top = topEntry();
  if (!top) return false;
  top.handler.current();
  return true;
}

// Whether an overlay is open over the page (docked panels don't count). A page's own hotkeys
// stand aside while one is: ask through utils/pageKeys.ts pageKeyBlocked, never a list of
// open-state flags.
export function hasOpenOverlay(): boolean {
  return stack.some((e) => !e.docked);
}

// Installed at module load — before any component mounts — so it runs ahead of listeners that
// components add to `document` later.
if (typeof document !== 'undefined') document.addEventListener('keydown', onKeyDown);

// The same, for an overlay that isn't a React component (a popover a ProseMirror widget opens,
// extensions/blockDesigns.ts). Returns the unregister function; call it when the overlay closes.
export function registerEscapeClose(onClose: () => void, opts?: Opts): () => void {
  const entry: Entry = { handler: { current: onClose }, docked: opts?.docked, when: { current: opts?.when } };
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function useEscapeClose(onClose: () => void, active = true, opts?: Opts) {
  const ref = useRef(onClose);
  const when = useRef(opts?.when);
  useEffect(() => { ref.current = onClose; when.current = opts?.when; });
  const docked = !!opts?.docked;

  useEffect(() => {
    if (!active) return;
    const entry: Entry = { handler: ref, docked, when };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active, docked]);
}
