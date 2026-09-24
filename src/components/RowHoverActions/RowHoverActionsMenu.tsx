import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './RowHoverActions.module.css';

// The floating panel half of the RowHoverActions pattern — see useRowHoverActions.ts for the
// open/close state machine this is driven by. Portaled to `document.body` (so it can't be
// clipped by a narrow sidebar column, and is immune to any ancestor's CSS `transform`, same
// reasoning as `TruncatedText`/the Modals section's own note on this), positioned from the
// row's `getBoundingClientRect()`, placed below the row unless there isn't room (then above).

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children: React.ReactNode;
}

// Rough estimate, not a measured value — these menus are always a short row of icon buttons
// (never wrapping/multi-line), so a fixed threshold for "is there room below" is accurate
// enough without a two-pass measure-then-position render.
const ESTIMATED_MENU_HEIGHT = 40;

export function RowHoverActionsMenu({ anchorRef, open, onMouseEnter, onMouseLeave, children }: Props) {
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'above' | 'below' } | null>(null);

  // A genuine external-system read (DOM layout via getBoundingClientRect, which only exists
  // once the anchor has actually painted) — not state derivable from props/state alone, so
  // this is the codebase's documented exception shape (see CLAUDE.md's list of similar
  // eslint-disable sites) rather than the "copy item state into a form" anti-pattern the rule
  // is normally guarding against. Reading `.current` itself is only ever done here, in an
  // effect — never directly in the render body (that trips `react-hooks/refs` instead).
  useEffect(() => {
    const el = open ? anchorRef.current : null;
    const next = el ? (() => {
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const placement: 'above' | 'below' =
        spaceBelow >= ESTIMATED_MENU_HEIGHT + 4 || rect.top < ESTIMATED_MENU_HEIGHT + 4 ? 'below' : 'above';
      return { left: rect.right, top: placement === 'below' ? rect.bottom + 4 : rect.top - 4, placement };
    })() : null;
    setPos(next);
  }, [open, anchorRef]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      className={styles.menu}
      style={{
        left: pos.left,
        top: pos.top,
        transform: `translate(-100%, ${pos.placement === 'above' ? '-100%' : '0'})`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body
  );
}
