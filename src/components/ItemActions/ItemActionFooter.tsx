import { LABELS } from '@/config/labels';
import { ArchiveIcon, RestoreIcon, TrashIcon } from './icons';
import styles from './ItemActions.module.css';

interface Props {
  archived:     boolean;
  canArchive?:  boolean;
  deleteLabel:  string;
  onArchive:    () => void;
  onRestore:    () => void;
  onDelete:     () => void;
}

// The one archive/restore + delete footer every item pane uses (Task, Calendar event, Calendar
// reminder — and any future app's detail pane). Pair it with useItemActions for the dialogs and
// hotkeys, and ItemActionDialog for the confirmations.
export function ItemActionFooter({ archived, canArchive = true, deleteLabel, onArchive, onRestore, onDelete }: Props) {
  const L = LABELS.itemActions;
  return (
    <footer className={styles.footer}>
      {archived ? (
        <button type="button" className={styles.actionBtn} onClick={onRestore} title={`${L.restore} (Ctrl+Shift+A)`}>
          <RestoreIcon /> {L.restore}
        </button>
      ) : canArchive && (
        <button type="button" className={styles.actionBtn} onClick={onArchive} title={`${L.archive} (Ctrl+Shift+A)`}>
          <ArchiveIcon /> {L.archive}
        </button>
      )}
      <button type="button" className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={onDelete} title="Delete / Ctrl+Shift+D">
        <TrashIcon /> {deleteLabel}
      </button>
    </footer>
  );
}
