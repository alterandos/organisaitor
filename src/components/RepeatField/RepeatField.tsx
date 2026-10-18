import { LABELS } from '@/config/labels';
import type { RepeatConfig, RepeatFreq } from '@/types';
import { weekOfMonth } from '@/utils/recurrence';
import styles from './RepeatField.module.css';

interface Props {
  value:    RepeatConfig | null;
  onChange: (repeat: RepeatConfig | null) => void;
  hint?:    string;
  // The host's own label style for the "Repeat" checkbox, so it matches the fields around it.
  labelClassName?: string;
  // The item's (first) date: offers "on the 2nd Tuesday" for monthly/yearly and marks its weekday.
  date?: string | null;
}

const FREQS: RepeatFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const DEFAULT: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Drops the parts of a rule that don't apply to its frequency (weekdays only on weekly, the nth
// weekday only on monthly/yearly), so switching frequency never leaves a hidden setting behind.
function tidy(r: RepeatConfig): RepeatConfig {
  const { daysOfWeek, monthWeekday, ...rest } = r;
  return {
    ...rest,
    ...(r.freq === 'weekly' && daysOfWeek?.length ? { daysOfWeek } : {}),
    ...((r.freq === 'monthly' || r.freq === 'yearly') && monthWeekday ? { monthWeekday } : {}),
  };
}

// A repeat rule: on/off, every N days/weeks/months/years, ending never / after N times / on a
// date. Controlled: every change hands back the whole rule (null = doesn't repeat). Used by the
// task pane, the add-task modal, the add-calendar-item modal and the event, reminder and deadline
// panes: THE repeat editor (pattern test "one repeat-rule editor"). Routines pick weekdays instead.
export function RepeatField({ value, onChange, hint, labelClassName, date }: Props) {
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
  const monthBy = value?.monthWeekday ? (value.monthWeekday.week === -1 ? 'last' : 'nth') : 'day';
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
            <input
              type="number"
              className={styles.num}
              min={1}
              value={value.interval}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <select className={styles.select} value={value.freq} onChange={(e) => set({ freq: e.target.value as RepeatFreq })}>
              {FREQS.map((f) => <option key={f} value={f}>{L.units[f][value.interval === 1 ? 0 : 1]}</option>)}
            </select>
          </div>
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
                value={monthBy}
                onChange={(e) => {
                  const by = e.target.value;
                  set({ monthWeekday: by === 'day' ? undefined : { week: by === 'last' ? -1 : nth.week, day: startDay } });
                }}
              >
                <option value="day">{L.monthOnDay(start.getDate())}</option>
                {nth.week <= 4 && <option value="nth">{L.monthOnWeekday(L.nth[nth.week], L.dayName[startDay])}</option>}
                {nth.isLast && <option value="last">{L.monthOnWeekday(L.nth[-1], L.dayName[startDay])}</option>}
              </select>
            </div>
          )}
          <div className={styles.row}>
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
              <input type="date" className={styles.date} value={value.until ?? ''} onChange={(e) => set({ until: e.target.value || null })} />
            )}
          </div>
          {hint && <p className={styles.hint}>{hint}</p>}
        </div>
      )}
    </div>
  );
}
