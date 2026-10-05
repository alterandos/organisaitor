import { Children } from 'react';
import { usePlatform } from '@/hooks/usePlatform';
import { LABELS } from '@/config/labels';
import { useRowHoverActions } from './useRowHoverActions';
import { RowHoverActionsMenu } from './RowHoverActionsMenu';
import { rowActionItems } from './rowActionItems';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import styles from './RowHoverActions.module.css';

// Suite-wide nav-column row actions (a notebook, a list, an Endeavour, a tracker, …). The row's
// leading icon slot turns into a "⋯" while the row is hovered; hovering (or clicking) the "⋯"
// drops the row's actions down as a narrow column of icon buttons under it. The column is no
// wider than the icon slot, so it covers only the icons of the rows below, never a title.
// Hovering the row itself opens nothing. History: 2026-09-24 the actions floated below the row on
// any row hover; 2026-10-05 a ⋯ at the row's right end expanded rightwards over the next column;
// the same day, at the user's request, moved to the left in place of the icon (see CLAUDE.md
// "Row options menu").
//
// Render it as the row's FIRST direct child, in place of the row's icon (pass the icon as `icon`).
// A row without an icon still gets the empty slot, so every title starts at the same place.
// On Android there is no "⋯": the slot shows the icon, and a long-press on `rowRef` opens the
// same actions in a bottom sheet. Children are RowActions. The same actions are also the row's
// right-click menu (a `row` scope, see CLAUDE.md "Right-click menus").
export function RowOptionsMenu({ rowRef, title, icon, children }: {
  rowRef:   React.RefObject<HTMLElement | null>;
  // The row's name: the button's tooltip and the Android sheet's heading.
  title:    string;
  icon?:    React.ReactNode;
  children: React.ReactNode;
}) {
  const { isAndroid } = usePlatform();
  const { anchorRef, open, rowHandlers, openNow, menuHandlers } = useRowHoverActions<HTMLButtonElement>({ longPressRef: rowRef });
  const count = Children.toArray(children).length;
  useContextMenuScope(rowRef, () => ({ kind: 'row', data: { title }, items: () => rowActionItems(children) }));
  return (
    <span className={`${styles.slot} ${open ? styles.slotOpen : ''}`}>
      {icon != null && <span className={styles.slotIcon}>{icon}</span>}
      {!isAndroid && (
        <button
          ref={anchorRef}
          type="button"
          className={styles.trigger}
          onClick={(e) => { e.stopPropagation(); openNow(); }}
          title={LABELS.rowActions.options(title)}
          aria-label={LABELS.rowActions.options(title)}
          aria-haspopup="menu"
          aria-expanded={open}
          draggable={false}
          {...rowHandlers}
        >⋯</button>
      )}
      <RowHoverActionsMenu
        anchorRef={anchorRef}
        open={open}
        align="dropdown"
        estimatedHeight={count * 24 + 6}
        className={styles.menuColumn}
        title={title}
        {...menuHandlers}
      >
        {children}
      </RowHoverActionsMenu>
    </span>
  );
}
