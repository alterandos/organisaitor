import { DateInput } from '@/components/DateInput/DateInput';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { DateChecklist } from '@/components/DateChecklist/DateChecklist';
import { ClassClashField } from '@/components/ClassClashField/ClassClashField';
import { computeLinkedEndTime, todayIso } from '@/utils/date';
import { expandScheduleBlock } from '@/utils/scheduleOccurrences';
import { addDaysToIso } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { RepeatConfig, ScheduleBlock } from '@/types';
import styles from './AddScheduleModal.module.css';

const S = LABELS.scheduleEditor;
const DAY_LETTERS = LABELS.recurring.dayLetter;
// When a schedule has no end date, the skip list would otherwise list dates forever: capped, and
// the list says so.
const OCCURRENCE_LIST_CAP_DAYS = 120;

// All of a block's dates within the schedule's dates, ignoring its own skips (so the list can show
// every date, ticked or not).
function blockDates(block: ScheduleBlock, startDate: string, endDate: string): string[] {
  const from = startDate || block.intervalAnchor || todayIso();
  const to = endDate || addDaysToIso(from, OCCURRENCE_LIST_CAP_DAYS);
  return expandScheduleBlock({ ...block, exceptions: [] }, { startDate: from, endDate: to }, from, to);
}

// THE fields of a Schedule block, for a new one and an existing one alike (2026-11-07: the add form
// had drifted, with no skip list and no clash question). The host keeps the row and saves it.
export function ScheduleBlockFields({ row, onChange, startDate, endDate, changed, autoFocus = false }: {
  row: ScheduleBlock;
  onChange: (patch: Partial<ScheduleBlock>) => void;
  startDate: string;
  endDate: string;
  // Dates taken out of the block's item as items of their own: shown in the skip list, not to be ticked here.
  changed: ReadonlySet<string>;
  autoFocus?: boolean;
}) {
  const dates = blockDates(row, startDate, endDate);
  const exceptions = new Set(row.exceptions);
  // The block as the repeating item it becomes, to ask about clashes with the rest of the calendar.
  const repeat: RepeatConfig = { freq: 'weekly', interval: row.interval, endKind: endDate ? 'until' : 'forever', count: null, until: endDate || null,
    daysOfWeek: row.daysOfWeek, exceptions: row.exceptions };
  return (
    <>
      <div className={styles.fieldMini}>
        <label className={styles.miniLabel}>{S.title}</label>
        <input className={styles.miniInput} placeholder={S.titlePlaceholder} value={row.title} autoFocus={autoFocus} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div className={styles.fieldMini}>
        <label className={styles.miniLabel}>{S.days}</label>
        <div className={styles.dayToggleRow}>
          {DAY_LETTERS.map((letter, d) => (
            <button key={d} type="button" aria-label={LABELS.recurring.dayName[d]} aria-pressed={row.daysOfWeek.includes(d)}
              className={`${styles.dayToggle} ${row.daysOfWeek.includes(d) ? styles.dayToggleActive : ''}`}
              onClick={() => onChange({ daysOfWeek: row.daysOfWeek.includes(d) ? row.daysOfWeek.filter((x) => x !== d) : [...row.daysOfWeek, d].sort((a, b) => a - b) })}>
              {letter}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.timeRow}>
        <TimeInput className={styles.miniTimeInput} value={row.startTime} onChange={(v) => onChange({ startTime: v, endTime: computeLinkedEndTime(v, row.endTime).time })} />
        <span className={styles.timeSep}>→</span>
        <TimeInput className={styles.miniTimeInput} value={row.endTime} onChange={(v) => onChange({ endTime: v })} />
      </div>
      <div className={styles.fieldMini}>
        <label className={styles.miniLabel}>{S.repeatsEvery}</label>
        <div className={styles.intervalRow}>
          <input className={styles.miniIntervalInput} type="number" min={1} max={8} value={row.interval}
            onChange={(e) => onChange({ interval: Math.max(1, Number(e.target.value) || 1) })} />
          <span>{S.weeks(row.interval)}</span>
        </div>
      </div>
      <div className={styles.fieldMini}>
        <label className={styles.miniLabel}>{S.firstOccurrence}</label>
        <DateInput className={styles.dateInput} value={row.intervalAnchor} onChange={(v) => onChange({ intervalAnchor: v })} />
        <p className={styles.miniHint}>{row.interval > 1 ? S.firstHintEvery : S.firstHint}</p>
      </div>
      <div className={styles.fieldMini}>
        <label className={styles.miniLabel}>{S.location}</label>
        <input className={styles.miniInput} placeholder={S.locationPlaceholder} value={row.location ?? ''} onChange={(e) => onChange({ location: e.target.value || null })} />
      </div>
      <div className={styles.fieldMini}>
        <label className={styles.miniLabelCheckbox}>
          <input type="checkbox" checked={row.requiresCommitment ?? false} onChange={(e) => onChange({ requiresCommitment: e.target.checked })} />
          {LABELS.scheduleCommit.option}
        </label>
        <p className={styles.miniHint}>{LABELS.scheduleCommit.optionHint}</p>
      </div>
      {dates[0] && row.daysOfWeek.length > 0 && (
        <ClassClashField
          item={{ id: row.id, date: dates[0], start: row.startTime, end: row.endTime, repeat, status: row.requiresCommitment ? 'tentative' : 'confirmed' }}
          value={row.onClass ?? null}
          onChange={(onClass) => onChange({ onClass })}
        />
      )}
      <div className={styles.fieldMini}>
        <label className={styles.miniLabel}>{S.skip}</label>
        {dates.length === 0 ? <p className={styles.miniHint}>{S.skipNone}</p> : (
          <>
            <DateChecklist dates={dates} label={S.skip}
              locked={new Map([...changed].map((d) => [d, LABELS.period.changedDate]))}
              checked={(date) => !exceptions.has(date) || changed.has(date)}
              onToggle={(date) => onChange({ exceptions: exceptions.has(date) ? row.exceptions.filter((d) => d !== date) : [...row.exceptions, date] })} />
            {!endDate && <p className={styles.miniHint}>{S.skipCapped(OCCURRENCE_LIST_CAP_DAYS)}</p>}
          </>
        )}
      </div>
    </>
  );
}
