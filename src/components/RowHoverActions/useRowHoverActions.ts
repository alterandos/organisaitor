import { useEffect, useRef, useState } from 'react';
import { usePlatform } from '@/hooks/usePlatform';
import { useLongPress } from '@/hooks/useLongPress';

// The open/close state machine behind every hover-opened action menu: nav-column rows (through
// RowOptionsMenu, where the anchor is the row's "⋯" button) and HoverOptions (where it is the
// button that has alternatives). Pairs with `RowHoverActionsMenu` (its own file — a hook and a
// component can't share a file and still get Fast Refresh, per react-refresh/only-export-components).
//
// Hover the anchor → open (after a short delay, so a fast
// mouse-pass across a scrolling list doesn't flash menus open). Leave the row OR the floating
// menu → close, after a grace-period delay so moving the mouse from the row to the menu (they
// aren't DOM-adjacent, so CSS :hover can't bridge the gap) doesn't close it first. Cancelling
// that close timer is what keeps it open across the gap.
//
// Android has no hover: a long-press on the anchor (or on `longPressRef`, the whole row, when
// the anchor is a small button that Android doesn't show) opens the same actions in a bottom sheet
// (RowHoverActionsMenu renders them there), and the hover handlers do nothing, because a tap's
// emulated mouseenter would otherwise open the sheet on every tap.

interface UseRowHoverActionsResult<T extends HTMLElement> {
  anchorRef: React.RefObject<T | null>;
  open: boolean;
  rowHandlers: { onMouseEnter: () => void; onMouseLeave: () => void };
  openNow: () => void;
  menuHandlers: { onMouseEnter: () => void; onMouseLeave: () => void; onClose: () => void };
}

const OPEN_DELAY_MS  = 150; // matches ChronicleView's existing hover-expand delay
const CLOSE_DELAY_MS = 250; // long enough to cross the row→menu gap at a normal mouse speed

export function useRowHoverActions<T extends HTMLElement = HTMLDivElement>(
  opts?: { longPressRef?: React.RefObject<HTMLElement | null> },
): UseRowHoverActionsResult<T> {
  const { isAndroid } = usePlatform();
  const anchorRef = useRef<T>(null);
  const [open, setOpen] = useState(false);
  const openTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current)  { clearTimeout(openTimer.current);  openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  useEffect(() => clearTimers, []);
  useLongPress(opts?.longPressRef ?? anchorRef, () => setOpen(true), isAndroid);

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

  const noop = () => {};
  const close = () => { clearTimers(); setOpen(false); };
  const openNow = () => { clearTimers(); setOpen(true); };

  return {
    anchorRef,
    open,
    openNow,
    rowHandlers:  isAndroid ? { onMouseEnter: noop, onMouseLeave: noop } : { onMouseEnter: scheduleOpen, onMouseLeave: scheduleClose },
    menuHandlers: { onMouseEnter: cancelClose, onMouseLeave: scheduleClose, onClose: close },
  };
}
