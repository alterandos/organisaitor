import styles from './ActionSheet.module.css';

// One full-width row of an action sheet: icon, then label. Shared by ActionSheet and by
// RowAction when a row's actions show in the long-press sheet, so every sheet looks the same.
export function ActionSheetButton({ icon, label, onClick, destructive }: {
  icon?:        React.ReactNode;
  label:        string;
  onClick:      (e: React.MouseEvent) => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${styles.item} ${destructive ? styles.destructive : ''}`}
      onClick={onClick}
    >
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
