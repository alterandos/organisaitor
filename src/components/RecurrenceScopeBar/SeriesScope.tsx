import { useId } from 'react';
import type { RepeatConfig, ScheduleId } from '@/types';
import { useScheduleStore } from '@/store/scheduleStore';
import { useUIStore } from '@/store/uiStore';
import { repeatSummary } from '@/services/recurringTasks';
import { ITEM_FLAG_ICON } from '@/config/itemIcons';
import { LABELS } from '@/config/labels';
import { OpenIcon } from '@/components/Icons';
import styles from './RecurrenceScopeBar.module.css';

// A repeating calendar item's pane (2026-11-05, replacing the four-button RecurrenceScopeBar after
// the user found it bulky): ONE slim line saying how it repeats ("Every week on Mon · from 3 Feb
// 2026 · 2 dates removed"), the Schedule it's part of, and which dates the pane changes ("Editing:
// All dates ▾", or only this date, or this and the following). The way the big calendar apps ask
// "this event, this and following, all", but asked once, up front, since the pane saves every
// field as it changes rather than on a Save button.
//
// Nothing is copied until something is changed (useSeriesScope): choosing "Only this date" and
// changing nothing leaves the series as it was. Delete follows the same choice.

import type { SeriesScope } from './useSeriesScope';

const S = LABELS.calendarSeries;

export function SeriesScopeLine({ repeat, firstDate, occurrence, scope, onScope, scheduleId }: {
  repeat: RepeatConfig; firstDate: string; occurrence: string | null;
  scope: SeriesScope; onScope: (s: SeriesScope) => void; scheduleId?: ScheduleId | null;
}) {
  const labelId = useId();
  const schedule = useScheduleStore((s) => (scheduleId ? s.schedules[scheduleId] : undefined));
  const occ = occurrence ?? firstDate;
  const isFirst = occ === firstDate;
  // Just how it repeats ("Every week on Mon · until 4 Dec 2026"): the first date is in the fields below.
  const summary = repeatSummary(repeat);
  const choices: [SeriesScope, string][] = [['all', S.scopeAll], ['this', S.scopeThis], ...(isFirst ? [] : [['following', S.scopeFollowing]] as [SeriesScope, string][])];
  // A shaded line with the usual thin border, so which dates a change goes to isn't missed without
  // shouting (the user, 2026-11-05: a dropdown was too easy to overlook, red too much); pills, all in view.
  return (
    <div className={styles.line} data-scope={scope}>
      <div className={styles.lineTop}>
        <span className={styles.summary}><span aria-hidden="true">{ITEM_FLAG_ICON.repeats}</span> {summary}</span>
        {schedule && (
          <button type="button" className={styles.chip} title={S.openSchedule} onClick={() => useUIStore.getState().openEditSchedule(schedule)}>
            🗓 {S.partOfSchedule(schedule.name)} <OpenIcon />
          </button>
        )}
      </div>
      {occurrence && (
        <div className={styles.scope}>
          <span id={labelId} className={styles.scopeLabel}>{S.editing}</span>
          <div className={styles.pills} role="radiogroup" aria-labelledby={labelId}>
            {choices.map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={scope === v}
                className={`${styles.pill} ${scope === v ? styles.pillOn : ''}`} onClick={() => onScope(v)}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
