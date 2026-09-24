import { useEffect, useRef, useState } from 'react';

// Suite-wide "row action menu" pattern: hovering a nav-column row (a notebook, a list, an
// Endeavour, a tracker, …) floats its action buttons (edit/delete/…) in a small panel above
// or below the row, instead of growing them inline within the row and squeezing the name —
// the old per-component convention every row-hover-action site independently hand-rolled,
// which was exactly what made it easy to mis-click (the buttons ate into the row's own width).
// Pairs with `RowHoverActionsMenu` (its own file — a hook and a component can't share a file
// and still get Fast Refresh, per react-refresh/only-export-components).
//
// The open/close state machine: hover the row → open (after a short delay, so a fast
// mouse-pass across a scrolling list doesn't flash menus open). Leave the row OR the floating
// menu → close, after a grace-period delay so moving the mouse from the row to the menu (they
// aren't DOM-adjacent, so CSS :hover can't bridge the gap) doesn't close it first. Cancelling
// that close timer is what keeps it open across the gap.

interface UseRowHoverActionsResult<T extends HTMLElement> {
  anchorRef: React.RefObject<T | null>;
  open: boolean;
  rowHandlers: { onMouseEnter: () => void; onMouseLeave: () => void };
  menuHandlers: { onMouseEnter: () => void; onMouseLeave: () => void };
}

const OPEN_DELAY_MS  = 150; // matches ChronicleView's existing hover-expand delay
const CLOSE_DELAY_MS = 250; // long enough to cross the row→menu gap at a normal mouse speed

export function useRowHoverActions<T extends HTMLElement = HTMLDivElement>(): UseRowHoverActionsResult<T> {
  const anchorRef = useRef<T>(null);
  const [open, setOpen] = useState(false);
  const openTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current)  { clearTimeout(openTimer.current);  openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  useEffect(() => clearTimers, []);

  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  return {
    anchorRef,
    open,
    rowHandlers:  { onMouseEnter: scheduleOpen, onMouseLeave: scheduleClose },
    menuHandlers: { onMouseEnter: cancelClose,  onMouseLeave: scheduleClose },
  };
}
