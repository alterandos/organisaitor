import { useContext } from 'react';
import { ActionSheetButton } from '@/components/ActionSheet/ActionSheetButton';
import { RowActionsSheetContext } from './rowActionsContext';

// One action in a RowHoverActionsMenu. On desktop it's the row's icon button (the site's own
// `className`), with `label` as its tooltip. In the Android long-press sheet it's a full-width
// row showing icon AND label, and choosing it closes the sheet first. `label` comes from LABELS.
export function RowAction({ icon, label, onClick, className, destructive }: {
  icon:         React.ReactNode;
  label:        string;
  onClick:      () => void;
  className?:   string;
  destructive?: boolean;
}) {
  const sheet = useContext(RowActionsSheetContext);
  if (sheet) {
    return (
      <ActionSheetButton
        icon={icon}
        label={label}
        destructive={destructive}
        onClick={(e) => { e.stopPropagation(); sheet.close(); onClick(); }}
      />
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
