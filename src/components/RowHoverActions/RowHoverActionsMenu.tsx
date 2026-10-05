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
// anchor's `getBoundingClientRect()`. `align` 'start'/'end' places it below the anchor unless
// there isn't room (then above); 'dropdown' (RowOptionsMenu's "⋯") does the same, but centred
// under the anchor, and close to it, so a column no wider than the anchor stays in its column.
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
  // 'dropdown': centred under the anchor (a row's "⋯", whose actions drop down as a narrow column).
  align?: 'start' | 'end' | 'dropdown';
  // For a taller menu (a vertical list of labelled options) so "is there room below" is right.
  estimatedHeight?: number;
  className?: string;
}

// Rough estimate, not a measured value — these menus are always a short row of icon buttons
// (never wrapping/multi-line), so a fixed threshold for "is there room below" is accurate
// enough without a two-pass measure-then-position render.
const ESTIMATED_MENU_HEIGHT = 40;

type Pos = { left: number; top: number; transform: string };

export function RowHoverActionsMenu({ anchorRef, open, onMouseEnter, onMouseLeave, onClose, children, title, align = 'end', estimatedHeight = ESTIMATED_MENU_HEIGHT, className }: Props) {
  const { isAndroid } = usePlatform();
  const [pos, setPos] = useState<Pos | null>(null);

  // A genuine external-system read (DOM layout via getBoundingClientRect, which only exists
  // once the anchor has actually painted) — not state derivable from props/state alone, so
  // this is the codebase's documented exception shape (see CLAUDE.md's list of similar
  // eslint-disable sites) rather than the "copy item state into a form" anti-pattern the rule
  // is normally guarding against. Reading `.current` itself is only ever done here, in an
  // effect — never directly in the render body (that trips `react-hooks/refs` instead).
  useEffect(() => {
    const el = open && !isAndroid ? anchorRef.current : null;
    const next = el ? ((): Pos => {
      const rect = el.getBoundingClientRect();
      if (align === 'dropdown') {
        const below = window.innerHeight - rect.bottom >= estimatedHeight + 2 || rect.top < estimatedHeight + 2;
        return {
          left: rect.left + rect.width / 2,
          top: below ? rect.bottom + 2 : rect.top - 2,
          transform: `translate(-50%, ${below ? '0' : '-100%'})`,
        };
      }
      const spaceBelow = window.innerHeight - rect.bottom;
      const below = spaceBelow >= estimatedHeight + 4 || rect.top < estimatedHeight + 4;
      return {
        left: align === 'start' ? rect.left : rect.right,
        top: below ? rect.bottom + 4 : rect.top - 4,
        transform: `translate(${align === 'start' ? '0' : '-100%'}, ${below ? '0' : '-100%'})`,
      };
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
      style={{ left: pos.left, top: pos.top, transform: pos.transform }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body
  );
}
