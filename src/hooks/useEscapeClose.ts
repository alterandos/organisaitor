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

interface Entry { handler: { current: () => void } }

const stack: Entry[] = [];

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  top.handler.current();
}

// Installed at module load — before any component mounts — so it runs ahead of listeners that
// components add to `document` later.
if (typeof document !== 'undefined') document.addEventListener('keydown', onKeyDown);

export function useEscapeClose(onClose: () => void, active = true) {
  const ref = useRef(onClose);
  useEffect(() => { ref.current = onClose; });

  useEffect(() => {
    if (!active) return;
    const entry: Entry = { handler: ref };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
