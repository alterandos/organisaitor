import { BottomSheet } from '@/components/BottomSheet/BottomSheet';
import { ActionSheetButton } from './ActionSheetButton';
import styles from './ActionSheet.module.css';

export interface ActionSheetItem {
  label:        string;
  icon?:        React.ReactNode;
  onSelect:     () => void;
  destructive?: boolean;
}

// A BottomSheet holding a list of actions: what a long-press opens on a phone (decision D1).
// Mount it only while open. Choosing an action closes the sheet first, then runs the action,
// so a dialog the action opens is never stacked over a sheet that is about to disappear.
export function ActionSheet({ items, onClose, title }: {
  items:   ActionSheetItem[];
  onClose: () => void;
  title?:  string;
}) {
  return (
    <BottomSheet onClose={onClose} title={title}>
      <div className={styles.list} role="menu">
        {items.map((item) => (
          <ActionSheetButton
            key={item.label}
            icon={item.icon}
            label={item.label}
            destructive={item.destructive}
            onClick={(e) => { e.stopPropagation(); onClose(); item.onSelect(); }}
          />
        ))}
      </div>
    </BottomSheet>
  );
}
