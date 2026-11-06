import { DateInput } from '@/components/DateInput/DateInput';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { LABELS } from '@/config/labels';
import styles from './EventWhenField.module.css';

// When an event is (2026-11-05): two aligned rows, Starts [date][time] and Ends [date][time], the
// way the big calendar apps lay it out, so a multi-day event's dates and times line up (they were
// two rows, Date and Time, each with its own arrow, and didn't). The same in the create form and the
// event pane; the time rules (an end following its start) stay with the caller's handlers.
export function EventWhenField({ date, endDate, startTime, endTime, onDate, onEndDate, onStartTime, onEndTime, allDay }: {
  date: string; endDate: string; startTime: string; endTime: string;
  onDate: (v: string) => void; onEndDate: (v: string) => void; onStartTime: (v: string) => void; onEndTime: (v: string) => void;
  allDay?: boolean;
}) {
  const L = LABELS.calendarForm;
  return (
    <div className={styles.grid} data-all-day={allDay || undefined}>
      <span className={styles.label}>{L.starts}</span>
      <DateInput className={styles.date} value={date} onChange={onDate} required aria-label={L.date} />
      {!allDay && <TimeInput className={styles.time} value={startTime} onChange={onStartTime} placeholder={L.start} />}
      <span className={styles.label}>{L.ends}</span>
      <DateInput className={styles.date} value={endDate} min={date} onChange={onEndDate} aria-label={L.endDate} />
      {!allDay && <TimeInput className={styles.time} value={endTime} onChange={onEndTime} placeholder={L.end} />}
    </div>
  );
}
