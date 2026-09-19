import type { RepeatConfig } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import styles from './RecurrenceScopeBar.module.css';

interface Props {
  kind:           'event' | 'reminder';
  id:             string;
  baseDate:       string;
  repeat:         RepeatConfig;
  occurrenceDate: string | null;
  onClose:        () => void;
  onSwitch:       (newId: string) => void;
}

// Shown at the top of an event/reminder pane when the item repeats — the same "this occurrence /
// this and following / all" choice mainstream calendar apps offer. The pane's own fields keep
// editing the whole series; the buttons here either act on one occurrence directly (delete) or
// split it out first and switch the pane over to the split-off copy (edit), so everything
// below keeps its live-edit behaviour unchanged.
export function RecurrenceScopeBar({ kind, id, baseDate, repeat, occurrenceDate, onClose, onSwitch }: Props) {
  const store = useCalendarStore.getState;
  const occ = occurrenceDate ?? baseDate;
  const isFirst = occ === baseDate;
  const label = new Date(occ + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const skippedCount = repeat.exceptions?.length ?? 0;

  const editOnlyThis = () => {
    const newId = kind === 'event'
      ? store().detachEventOccurrence(id as never, occ)
      : store().detachReminderOccurrence(id as never, occ);
    if (newId) onSwitch(newId);
  };

  const editThisAndFollowing = () => {
    const newId = kind === 'event'
      ? store().splitEventSeries(id as never, occ)
      : store().splitReminderSeries(id as never, occ);
    if (newId) onSwitch(newId);
  };

  const deleteOnlyThis = () => {
    if (kind === 'event') store().skipEventOccurrence(id as never, occ);
    else store().skipReminderOccurrence(id as never, occ);
    onClose();
  };

  const deleteThisAndFollowing = () => {
    if (kind === 'event') store().endEventSeriesBefore(id as never, occ);
    else store().endReminderSeriesBefore(id as never, occ);
    onClose();
  };

  return (
    <div className={styles.bar}>
      <div className={styles.heading}>
        🔁 Repeating {kind} — occurrence on {label}
      </div>
      <p className={styles.hint}>
        The fields below change every occurrence. To change or remove only some of them:
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={editOnlyThis}>Edit only this one</button>
        {!isFirst && <button type="button" className={styles.btn} onClick={editThisAndFollowing}>Edit this and following</button>}
        <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={deleteOnlyThis}>Delete only this one</button>
        {!isFirst && <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={deleteThisAndFollowing}>Delete this and following</button>}
      </div>
      {skippedCount > 0 && <p className={styles.hint}>{skippedCount} occurrence{skippedCount === 1 ? '' : 's'} removed from this series.</p>}
    </div>
  );
}
