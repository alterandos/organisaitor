import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlatform } from '@/hooks/usePlatform';
import { BottomSheet } from '@/components/BottomSheet/BottomSheet';
import { RowActionsSheetContext } from './rowActionsContext';
import { useFloatingPlacement } from '@/utils/floatingPlacement';
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
  className?: string;
}

export function RowHoverActionsMenu({ anchorRef, open, onMouseEnter, onMouseLeave, onClose, children, title, align = 'end', className }: Props) {
  const { isAndroid } = usePlatform();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Below the anchor unless there isn't room, then above; too tall either way, it scrolls
  // (utils/floatingPlacement.ts, measured, so a long list of options is placed right).
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchor, align === 'dropdown'
    ? { align: 'center', gap: 2, margin: 4 }
    : { align, gap: 4, margin: 4 });

  // A genuine external-system read (DOM layout via getBoundingClientRect, which only exists
  // once the anchor has actually painted): the documented exception shape. Reading `.current`
  // is only ever done here, in an effect, never in the render body (`react-hooks/refs`).
  useEffect(() => {
    const el = open && !isAndroid ? anchorRef.current : null;
    setAnchor(el ? el.getBoundingClientRect() : null);
  }, [open, isAndroid, anchorRef]);

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

  if (!open || !anchor) return null;

  return createPortal(
    <div
      ref={ref}
      className={`${styles.menu} ${className ?? ''}`}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body
  );
}
