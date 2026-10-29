import { useState } from 'react';
import { LABELS } from '@/config/labels';
import { DateInput } from '@/components/DateInput/DateInput';
import type { RepeatConfig, RepeatFreq } from '@/types';
import { firstNthWeekdayFrom, weekOfMonth } from '@/utils/recurrence';
import { formatDate } from '@/utils/date';
import { useCalendarStore } from '@/store/calendarStore';
import { CloseIcon } from '@/components/Icons';
import styles from './RepeatField.module.css';

interface Props {
  value:    RepeatConfig | null;
  onChange: (repeat: RepeatConfig | null) => void;
  hint?:    string;
  // The host's own label style for the "Repeat" checkbox, so it matches the fields around it.
  labelClassName?: string;
  // The item's (first) date: offers "on the 2nd Tuesday" for monthly/yearly and marks its weekday.
  date?: string | null;
  // Moves the item's date onto a chosen nth weekday ("third Sunday") when it isn't on it already.
  onDateChange?: (date: string) => void;
}

const FREQS: RepeatFreq[] = ['daily', 'weekly', 'monthly', 'yearly', 'dates'];
const DEFAULT: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const NTH_ORDER = [1, 2, 3, 4, -1];

// Drops the parts of a rule that don't apply to its frequency (weekdays only on weekly, the nth
// weekday only on monthly/yearly), so switching frequency never leaves a hidden setting behind.
function tidy(r: RepeatConfig): RepeatConfig {
  const { daysOfWeek, monthWeekday, dates, follows, ...rest } = r;
  return {
    ...rest,
    ...(r.freq === 'weekly' && daysOfWeek?.length ? { daysOfWeek } : {}),
    ...((r.freq === 'monthly' || r.freq === 'yearly') && monthWeekday ? { monthWeekday } : {}),
    ...(r.freq === 'dates' ? { dates: dates ?? [], ...(follows ? { follows } : {}) } : {}),
  };
}

// A repeat rule: on/off, every N days/weeks/months/years, ending never / after N times / on a
// date. Controlled: every change hands back the whole rule (null = doesn't repeat). Used by the
// task pane, the add-task modal, the add-calendar-item modal and the event, reminder and deadline
// panes: THE repeat editor (pattern test "one repeat-rule editor"). Routines pick weekdays instead.
export function RepeatField({ value, onChange, hint, labelClassName, date, onDateChange }: Props) {
  const L = LABELS.recurring;
  const set = (patch: Partial<RepeatConfig>) => onChange(tidy({ ...(value ?? DEFAULT), ...patch }));
  const start = date ? new Date(date + 'T00:00:00') : null;
  const startDay = start ? start.getDay() : null;
  const days = value?.daysOfWeek?.length ? value.daysOfWeek : startDay !== null ? [startDay] : [];
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    set({ daysOfWeek: next.sort((a, b) => a - b) });
  };
  const nth = date ? weekOfMonth(date) : null;
  // "Every third Sunday" (2026-10-19): any week and weekday, not only the date's own. A series'
  // first date is always one of its dates, so a host that can move the date moves it onto the rule.
  const pickWeekday = (monthWeekday: RepeatConfig['monthWeekday']) => {
    set({ monthWeekday });
    if (monthWeekday && date && onDateChange) {
      const first = firstNthWeekdayFrom(date, monthWeekday);
      if (first !== date) onDateChange(first);
    }
  };
  return (
    <div className={styles.field}>
      <label className={labelClassName ?? styles.toggle}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? { ...DEFAULT } : null)} />
        {L.repeat}
      </label>
      {value && (
        <div className={styles.config}>
          <div className={styles.row}>
            <span className={styles.small}>{L.every}</span>
            {value.freq !== 'dates' && (
              <input
                type="number"
                className={styles.num}
                min={1}
                value={value.interval}
                onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
              />
            )}
            <select
              className={styles.select}
              value={value.freq}
              onChange={(e) => {
                const freq = e.target.value as RepeatFreq;
                set(freq === 'dates' ? { freq, interval: 1, endKind: 'forever', count: null, until: null, dates: value.dates?.length ? value.dates : date ? [date] : [] } : { freq });
              }}
            >
              {FREQS.map((f) => <option key={f} value={f}>{f === 'dates' ? L.onDates : L.units[f][value.interval === 1 ? 0 : 1]}</option>)}
            </select>
          </div>
          {value.freq === 'dates' && <DatesList value={value} onChange={(r) => { set(r); if (r.dates?.[0] && r.dates[0] !== date) onDateChange?.(r.dates[0]); }} />}
          {value.freq === 'weekly' && (
            <div className={styles.row} role="group" aria-label={L.onDays}>
              <span className={styles.small}>{L.onDays}</span>
              {WEEK_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.day} ${days.includes(d) ? styles.dayOn : ''}`}
                  aria-pressed={days.includes(d)}
                  aria-label={L.dayName[d]}
                  title={L.dayName[d]}
                  onClick={() => toggleDay(d)}
                >
                  {L.dayLetter[d]}
                </button>
              ))}
            </div>
          )}
          {(value.freq === 'monthly' || value.freq === 'yearly') && start && nth && startDay !== null && (
            <div className={styles.row}>
              <select
                className={styles.select}
                aria-label={L.onDays}
                value={value.monthWeekday ? 'weekday' : 'day'}
                onChange={(e) => pickWeekday(e.target.value === 'day' ? undefined : { week: nth.week <= 4 ? nth.week : -1, day: startDay })}
              >
                <option value="day">{L.monthOnDay(start.getDate())}</option>
                <option value="weekday">{L.monthOnThe}</option>
              </select>
              {value.monthWeekday && (
                <>
                  <select
                    className={styles.select}
                    aria-label={L.whichWeek}
                    value={value.monthWeekday.week}
                    onChange={(e) => pickWeekday({ week: Number(e.target.value), day: value.monthWeekday!.day })}
                  >
                    {NTH_ORDER.map((w) => <option key={w} value={w}>{L.nth[w]}</option>)}
                  </select>
                  <select
                    className={styles.select}
                    aria-label={L.whichDay}
                    value={value.monthWeekday.day}
                    onChange={(e) => pickWeekday({ week: value.monthWeekday!.week, day: Number(e.target.value) })}
                  >
                    {WEEK_ORDER.map((d) => <option key={d} value={d}>{L.dayName[d]}</option>)}
                  </select>
                </>
              )}
            </div>
          )}
          {value.freq !== 'dates' && <div className={styles.row}>
            <span className={styles.small}>{L.ends}</span>
            <select
              className={styles.select}
              value={value.endKind}
              onChange={(e) => {
                const endKind = e.target.value as RepeatConfig['endKind'];
                set({ endKind, count: endKind === 'count' ? value.count ?? 10 : null, until: endKind === 'until' ? value.until : null });
              }}
            >
              <option value="forever">{L.endNever}</option>
              <option value="count">{L.endCount}</option>
              <option value="until">{L.endUntil}</option>
            </select>
            {value.endKind === 'count' && (
              <input
                type="number"
                className={styles.num}
                min={1}
                value={value.count ?? 10}
                onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })}
              />
            )}
            {value.endKind === 'until' && (
              <DateInput className={styles.date} value={value.until ?? ''} onChange={(v) => set({ until: v || null })} />
            )}
          </div>}
          {hint && <p className={styles.hint}>{hint}</p>}
        </div>
      )}
    </div>
  );
}

// A repeat on a list of dates: each date with a way to take it off, and a field to add one. When
// the dates follow other events ("1 day before each lecture"), it says so and offers to stop; the
// dates then stay as they are and can be changed by hand (services/repeatFollow.ts keeps them in step).
function DatesList({ value, onChange }: { value: RepeatConfig; onChange: (r: Partial<RepeatConfig>) => void }) {
  const L = LABELS.recurring;
  const events = useCalendarStore((s) => s.events);
  const [adding, setAdding] = useState('');
  const dates = value.dates ?? [];
  const followed = value.follows ? [...new Set(value.follows.ids.map((id) => events[id as never]?.title).filter(Boolean))].join(', ') : '';
  return (
    <div className={styles.dates}>
      {value.follows && (
        <div className={styles.row}>
          <span className={styles.small}>{L.follows(value.follows.offsetDays, followed || '…')}</span>
          <button type="button" className={styles.linkBtn} onClick={() => onChange({ follows: undefined })}>{L.stopFollowing}</button>
        </div>
      )}
      <ul className={styles.dateList}>
        {dates.map((d) => (
          <li key={d} className={styles.dateChip}>
            {formatDate(d + 'T00:00:00')}
            {!value.follows && (
              <button type="button" className={styles.chipX} aria-label={L.removeDate(formatDate(d + 'T00:00:00'))} onClick={() => onChange({ dates: dates.filter((x) => x !== d) })}>
                <CloseIcon />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!value.follows && (
        <div className={styles.row}>
          <span className={styles.small}>{L.addDate}</span>
          <DateInput
            className={styles.date}
            value={adding}
            aria-label={L.addDate}
            onChange={(v) => {
              setAdding(v);
              if (v) { onChange({ dates: [...new Set([...dates, v])].sort() }); setAdding(''); }
            }}
          />
        </div>
      )}
    </div>
  );
}
