import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { unlinkFromSeries, type SeriesKind } from '@/services/calendarSeries';
import { LABELS } from '@/config/labels';
import styles from './RecurrenceScopeBar.module.css';

interface Props {
  kind:       SeriesKind;
  id:         string;
  seriesId:   string;
  seriesDate: string | null;
  repeats:    boolean;   // this item is itself a series: the tail split off "this and following"
}

const dayLabel = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

// Shown at the top of an event/reminder/deadline pane whose item was taken out of a repeating
// series: which series and which of its dates, a way back to the series, and unlinking (the item
// stays as it is). The counterpart of RecurrenceScopeBar, which is how it got here.
export function SeriesLinkBar({ kind, id, seriesId, seriesDate, repeats }: Props) {
  const L = LABELS.calendarSeries;
  const series = useCalendarStore((s) => (kind === 'event' ? s.events : kind === 'reminder' ? s.reminders : s.deadlines)[seriesId as never]);
  const openSeries = () => {
    const ui = useUIStore.getState();
    if (seriesDate) ui.requestCalendarDate(seriesDate);
    if (kind === 'event') ui.openCalendarEventPane(seriesId);
    else if (kind === 'reminder') ui.openCalendarReminderPane(seriesId);
    else ui.openCalendarDeadlinePane(seriesId);
  };
  const date = seriesDate ? dayLabel(seriesDate) : '';
  return (
    <div className={styles.bar}>
      <div className={styles.heading}>
        🔁 {series ? (repeats ? L.partOfTail(date) : L.partOf(date)) : L.seriesGone}
      </div>
      <div className={styles.actions}>
        {series && <button type="button" className={styles.btn} onClick={openSeries}>{L.openSeries}</button>}
        <button type="button" className={styles.btn} title={L.unlinkHint} onClick={() => unlinkFromSeries(kind, id)}>{L.unlink}</button>
      </div>
    </div>
  );
}
