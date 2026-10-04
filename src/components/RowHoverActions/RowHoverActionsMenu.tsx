import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlatform } from '@/hooks/usePlatform';
import { BottomSheet } from '@/components/BottomSheet/BottomSheet';
import { RowActionsSheetContext } from './rowActionsContext';
import styles from './RowHoverActions.module.css';

// The floating panel half of the RowHoverActions pattern — see useRowHoverActions.ts for the
// open/close state machine this is driven by. Portaled to `document.body` (so it can't be
// clipped by a narrow sidebar column, and is immune to any ancestor's CSS `transform`, same
// reasoning as `TruncatedText`/the Modals section's own note on this), positioned from the
// row's `getBoundingClientRect()`, placed below the row unless there isn't room (then above).
// On Android the same children show as a vertical list in a BottomSheet instead (opened by a
// long-press, see useRowHoverActions); RowAction children render as labelled sheet rows there.

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClose: () => void;
  children: React.ReactNode;
  // Android sheet heading (e.g. the row's name).
  title?: string;
  // 'end' (default): right edges line up, the menu extends left — for actions at a row's end.
  // 'start': left edges line up — for a trigger at the left of its row (a task's checkbox).
  align?: 'start' | 'end';
  // For a taller menu (a vertical list of labelled options) so "is there room below" is right.
  estimatedHeight?: number;
  className?: string;
}

// Rough estimate, not a measured value — these menus are always a short row of icon buttons
// (never wrapping/multi-line), so a fixed threshold for "is there room below" is accurate
// enough without a two-pass measure-then-position render.
const ESTIMATED_MENU_HEIGHT = 40;

export function RowHoverActionsMenu({ anchorRef, open, onMouseEnter, onMouseLeave, onClose, children, title, align = 'end', estimatedHeight = ESTIMATED_MENU_HEIGHT, className }: Props) {
  const { isAndroid } = usePlatform();
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'above' | 'below' } | null>(null);

  // A genuine external-system read (DOM layout via getBoundingClientRect, which only exists
  // once the anchor has actually painted) — not state derivable from props/state alone, so
  // this is the codebase's documented exception shape (see CLAUDE.md's list of similar
  // eslint-disable sites) rather than the "copy item state into a form" anti-pattern the rule
  // is normally guarding against. Reading `.current` itself is only ever done here, in an
  // effect — never directly in the render body (that trips `react-hooks/refs` instead).
  useEffect(() => {
    const el = open && !isAndroid ? anchorRef.current : null;
    const next = el ? (() => {
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const placement: 'above' | 'below' =
        spaceBelow >= estimatedHeight + 4 || rect.top < estimatedHeight + 4 ? 'below' : 'above';
      return { left: align === 'start' ? rect.left : rect.right, top: placement === 'below' ? rect.bottom + 4 : rect.top - 4, placement };
    })() : null;
    setPos(next);
  }, [open, isAndroid, anchorRef, align, estimatedHeight]);

  if (isAndroid) {
    if (!open) return null;
    return (
      <BottomSheet onClose={onClose} title={title}>
        <RowActionsSheetContext.Provider value={{ close: onClose }}>
          <div className={styles.sheetActions} role="menu">{children}</div>
        </RowActionsSheetContext.Provider>
      </BottomSheet>
    );
  }

  if (!open || !pos) return null;

  return createPortal(
    <div
      className={`${styles.menu} ${className ?? ''}`}
      style={{
        left: pos.left,
        top: pos.top,
        transform: `translate(${align === 'start' ? '0' : '-100%'}, ${pos.placement === 'above' ? '-100%' : '0'})`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body
  );
}
