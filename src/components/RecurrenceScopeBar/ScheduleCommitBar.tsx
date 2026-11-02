import { useCalendarStore } from '@/store/calendarStore';
import { commitOccurrence, isCommittedOccurrence, uncommitOccurrence } from '@/services/schedules';
import { LABELS } from '@/config/labels';
import type { CalendarEventId } from '@/types';
import styles from './RecurrenceScopeBar.module.css';

// A Schedule item you don't always go to (tentative, docs/features/endeavours.md phase 7 (c)): going
// to one date takes it out of the series, confirmed, notifying shortly before; a confirmed date can
// go back to the series. Shown in the event pane.
const L = LABELS.scheduleCommit;

export function ScheduleCommitBar({ id, occurrenceDate, onSwitch, onClose }: {
  id: CalendarEventId; occurrenceDate: string | null; onSwitch: (id: CalendarEventId) => void; onClose: () => void;
}) {
  const event = useCalendarStore((s) => s.events[id]);
  if (!event?.scheduleId) return null;
  if (event.repeat && event.status === 'tentative') {
    const date = occurrenceDate ?? event.date;
    return (
      <div className={styles.bar}>
        <div className={styles.heading}>{L.tentative}</div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={() => { const copy = commitOccurrence(id, date); if (copy) onSwitch(copy); }}>{L.commit}</button>
        </div>
      </div>
    );
  }
  if (!isCommittedOccurrence(event)) return null;
  return (
    <div className={styles.bar}>
      <div className={styles.heading}>{L.going}</div>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={() => { uncommitOccurrence(id); onClose(); }}>{L.uncommit}</button>
      </div>
    </div>
  );
}
