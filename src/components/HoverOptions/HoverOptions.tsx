import { useRowHoverActions } from '@/components/RowHoverActions/useRowHoverActions';
import { RowHoverActionsMenu } from '@/components/RowHoverActions/RowHoverActionsMenu';
import { ActionSheet } from '@/components/ActionSheet/ActionSheet';
import { usePlatform } from '@/hooks/usePlatform';
import styles from './HoverOptions.module.css';

export interface HoverOption {
  label:   string;
  onClick: () => void;
}

// Hovering a button offers alternatives to its plain click, e.g. Complete → "Complete + add
// follow-up". The same hover/grace-period machinery as the row action menu (RowHoverActions),
// with labelled options in a vertical list. Clicking the button itself still does the default.
// With no options it renders just the button. On Android a long-press on the button opens the
// same options in an ActionSheet (the hook supplies the long-press); a tap is still the plain action.
interface Props {
  options:  HoverOption[];
  align?:   'start' | 'end';
  children: React.ReactNode;
}

export function HoverOptions(props: Props) {
  if (props.options.length === 0) return <>{props.children}</>;
  return <WithOptions {...props} />;
}

// Its own component so the hook (and its long-press listener) mounts with the anchor already
// rendered, including when a button gains options after first render.
function WithOptions({ options, align = 'start', children }: Props) {
  const { isAndroid } = usePlatform();
  const { anchorRef, open, rowHandlers, menuHandlers } = useRowHoverActions<HTMLSpanElement>();
  return (
    <span ref={anchorRef} className={styles.anchor} {...rowHandlers}>
      {children}
      {isAndroid ? (
        open && (
          <ActionSheet
            items={options.map((o) => ({ label: o.label, onSelect: o.onClick }))}
            onClose={menuHandlers.onClose}
          />
        )
      ) : (
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
      )}
    </span>
  );
}
