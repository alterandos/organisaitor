import { useRowHoverActions } from '@/components/RowHoverActions/useRowHoverActions';
import { RowHoverActionsMenu } from '@/components/RowHoverActions/RowHoverActionsMenu';
import styles from './HoverOptions.module.css';

export interface HoverOption {
  label:   string;
  onClick: () => void;
}

// Hovering a button offers alternatives to its plain click, e.g. Complete → "Complete + add
// follow-up". The same hover/grace-period machinery as the row action menu (RowHoverActions),
// with labelled options in a vertical list. Clicking the button itself still does the default.
// With no options it renders just the button.
export function HoverOptions({ options, align = 'start', children }: {
  options:  HoverOption[];
  align?:   'start' | 'end';
  children: React.ReactNode;
}) {
  const { anchorRef, open, rowHandlers, menuHandlers } = useRowHoverActions<HTMLSpanElement>();
  if (options.length === 0) return <>{children}</>;
  return (
    <span ref={anchorRef} className={styles.anchor} {...rowHandlers}>
      {children}
      <RowHoverActionsMenu
        anchorRef={anchorRef}
        open={open}
        align={align}
        estimatedHeight={options.length * 32 + 8}
        className={styles.menu}
        {...menuHandlers}
      >
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            className={styles.option}
            onClick={(e) => { e.stopPropagation(); o.onClick(); }}
          >
            {o.label}
          </button>
        ))}
      </RowHoverActionsMenu>
    </span>
  );
}
