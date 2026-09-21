import { LABELS } from '@/config/labels';
import { ArchiveIcon, CheckCircleIcon, RestoreIcon, TrashIcon } from './icons';
import styles from './ItemActions.module.css';

interface Props {
  archived:     boolean;
  canArchive?:  boolean;
  deleteLabel:  string;
  onArchive:    () => void;
  onRestore:    () => void;
  onDelete:     () => void;
  // Only for items that can be completed (a task, or the calendar entry of one): shows a
  // Complete / Mark incomplete toggle first in the row. Omit `onToggleComplete` for the rest.
  completed?:        boolean;
  onToggleComplete?: () => void;
}

// The one archive/restore + delete footer every item pane uses (Task, Calendar event, Calendar
// reminder — and any future app's detail pane). Pair it with useItemActions for the dialogs and
// hotkeys, and ItemActionDialog for the confirmations.
export function ItemActionFooter({ archived, canArchive = true, deleteLabel, onArchive, onRestore, onDelete, completed = false, onToggleComplete }: Props) {
  const L = LABELS.itemActions;
  return (
    <footer className={styles.footer}>
      {onToggleComplete && (
        <button
          type="button"
          className={`${styles.actionBtn} ${completed ? styles.completedBtn : ''}`}
          onClick={onToggleComplete}
          aria-pressed={completed}
        >
          <CheckCircleIcon /> {completed ? L.reopen : L.complete}
        </button>
      )}
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
