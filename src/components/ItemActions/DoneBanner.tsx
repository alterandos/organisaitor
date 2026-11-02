import { LABELS } from '@/config/labels';
import { formatDate } from '@/utils/date';
import { CheckCircleIcon } from '@/components/Icons';
import styles from './ItemActions.module.css';

interface Props {
  doneAt?:     string | null;   // when it was done, if known (a task's completedAt)
  reopenLabel: string;
  onReopen:    () => void;
}

// A done item's pane (2026-11-01): the state is said at the top, with the way back beside it as a
// plain secondary action, and the pane is outlined in the done colour (`styles.donePane`), so a
// green button in the footer is never what says it's done. ItemActionFooter leaves its Complete out
// while done, so a pane passing `completed` shows this (pattern test).
export function DoneBanner({ doneAt, reopenLabel, onReopen }: Props) {
  const L = LABELS.itemActions;
  return (
    <div className={styles.doneBanner} role="status">
      <CheckCircleIcon width={16} height={16} />
      <span className={styles.doneBannerText}>{doneAt ? L.doneOn(formatDate(doneAt)) : L.done}</span>
      <button type="button" className={styles.reopenBtn} onClick={onReopen}>{reopenLabel}</button>
    </div>
  );
}
