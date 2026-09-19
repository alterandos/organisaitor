import { LABELS } from '@/config/labels';
import { formatDate } from '@/utils/date';
import { ArchiveIcon } from './icons';
import styles from './ItemActions.module.css';

interface Props {
  archivedAt: string | null;
  reason:     string | null;
}

export function ArchivedBanner({ archivedAt, reason }: Props) {
  const L = LABELS.itemActions;
  return (
    <div className={styles.archivedBanner}>
      <div className={styles.archivedBannerHead}>
        <ArchiveIcon width={14} height={14} />
        <span>{L.archivedGroup}{archivedAt && ` ${formatDate(archivedAt)}`}</span>
      </div>
      {reason && (
        <p className={styles.archivedReason}>
          <strong>{L.reasonHeading}:</strong> {reason}
        </p>
      )}
    </div>
  );
}
