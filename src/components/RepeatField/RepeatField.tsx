import { useMemo, useState } from 'react';
import { LABELS } from '@/config/labels';
import { DateInput } from '@/components/DateInput/DateInput';
import type { RepeatConfig, RepeatFreq } from '@/types';
import { expandRepeat, firstNthWeekdayFrom, weekOfMonth } from '@/utils/recurrence';
import { addDaysToIso, formatDate, todayIso } from '@/utils/date';
import { DisclosureIcon } from '@/components/Icons';
import { useCalendarStore } from '@/store/calendarStore';
import { CloseIcon } from '@/components/Icons';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { DateChecklist } from '@/components/DateChecklist/DateChecklist';
import styles from './RepeatField.module.css';
import { FlagIcon } from '@/components/FlagCheck/FlagCheck';

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
  // Offers "Leave out dates" (calendar items): its dates, each unticked to skip it. `changed` are
  // dates taken out of the series as items of their own, shown but not to be ticked back here.
  skippable?: { changed?: ReadonlySet<string> };
  // The item's own time (an event's start, a reminder's or deadline's time): on a list of dates,
  // each date can have its own instead (`dateTimes`). Undefined: no times offered.
  itemTime?: string | null;
  // Turning Repeat on ends it on this date (its Endeavour's end), changeable (2026-11-07).
  defaultUntil?: string | null;
}

const FREQS: RepeatFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(2001, m, 1).toLocaleDateString(undefined, { month: 'long' }));

// The same year with this day and month (0-based), the day kept within the month (31 → 30 April).
function withDayMonth(iso: string, day: number, month: number): string {
  const year = Number(iso.slice(0, 4));
  const last = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
const DEFAULT: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const NTH_ORDER = [1, 2, 3, 4, -1];

// Drops the parts of a rule that don't apply to its frequency (weekdays only on weekly, the nth
// weekday only on monthly/yearly), so switching frequency never leaves a hidden setting behind.
function tidy(r: RepeatConfig): RepeatConfig {
  const { daysOfWeek, monthWeekday, dates, follows, dateTimes, ...rest } = r;
  // A date's own time is kept only while the date is on the list.
  const times = dateTimes ? Object.fromEntries(Object.entries(dateTimes).filter(([d, t]) => t && (dates ?? []).includes(d))) : {};
  return {
    ...rest,
    ...(r.freq === 'weekly' && daysOfWeek?.length ? { daysOfWeek } : {}),
    ...((r.freq === 'monthly' || r.freq === 'yearly') && monthWeekday ? { monthWeekday } : {}),
    ...(r.freq === 'dates' ? { dates: dates ?? [], ...(follows ? { follows } : {}), ...(Object.keys(times).length ? { dateTimes: times } : {}) } : {}),
  };
}

// A repeat rule: on/off, every N days/weeks/months/years, ending never / after N times / on a
// date. Controlled: every change hands back the whole rule (null = doesn't repeat). Used by the
// task pane, the add-task modal, the add-calendar-item modal and the event, reminder and deadline
// panes: THE repeat editor (pattern test "one repeat-rule editor"). Routines pick weekdays instead.
export function RepeatField({ value, onChange, hint, labelClassName, date, onDateChange, skippable, itemTime, defaultUntil }: Props) {
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
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked
          ? { ...DEFAULT, ...(defaultUntil && (!date || defaultUntil >= date) ? { endKind: 'until' as const, until: defaultUntil } : {}) }
          : null)} />
        <FlagIcon flag="repeats" />
        {L.repeat}
      </label>
      {value && (
        <div className={styles.config}>
          <div className={styles.pills} role="radiogroup" aria-label={L.howLabel}>
            {([['regular', L.regularly], ['dates', L.onDates]] as const).map(([how, label]) => {
              const on = (value.freq === 'dates') === (how === 'dates');
              return (
                <button key={how} type="button" role="radio" aria-checked={on} className={`${styles.pill} ${on ? styles.pillOn : ''}`}
                  onClick={() => { if (on) return; set(how === 'dates'
                    ? { freq: 'dates', interval: 1, endKind: 'forever', count: null, until: null, dates: value.dates?.length ? value.dates : date ? [date] : [] }
                    : { freq: 'weekly', ...(defaultUntil && (!date || defaultUntil >= date) ? { endKind: 'until' as const, until: defaultUntil } : {}) }); }}>
                  {label}
                </button>
              );
            })}
          </div>
          {value.freq !== 'dates' && <div className={styles.row}>
            <span className={styles.small}>{L.every}</span>
            <input
              type="number"
              className={styles.num}
              min={1}
              value={value.interval}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <select
              className={styles.select}
              value={value.freq}
              onChange={(e) => set({ freq: e.target.value as RepeatFreq })}
            >
              {FREQS.map((f) => <option key={f} value={f}>{L.units[f][value.interval === 1 ? 0 : 1]}</option>)}
            </select>
          </div>}
          {value.freq === 'dates' && <DatesList value={value} itemTime={itemTime} onChange={(r) => { set(r); if (r.dates?.[0] && r.dates[0] !== date) onDateChange?.(r.dates[0]); }} />}
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
                <option value="day">{value.freq === 'yearly' ? L.yearOnDate : L.monthOnDate}</option>
                <option value="weekday">{L.monthOnThe}</option>
              </select>
              {/* On a date (the default): the day, and for yearly the month, chosen here; they're the
                  item's own date (a series starts on one of its dates), so choosing moves it. */}
              {!value.monthWeekday && (
                <>
                  <select className={styles.select} aria-label={L.whichDate} value={start.getDate()} disabled={!onDateChange}
                    onChange={(e) => onDateChange?.(withDayMonth(date!, Number(e.target.value), start.getMonth()))}>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {value.freq === 'yearly' && (
                    <select className={styles.select} aria-label={L.whichMonth} value={start.getMonth()} disabled={!onDateChange}
                      onChange={(e) => onDateChange?.(withDayMonth(date!, start.getDate(), Number(e.target.value)))}>
                      {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                    </select>
                  )}
                </>
              )}
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
              <DateInput className={styles.date} value={value.until ?? ''} min={date ?? undefined} onChange={(v) => set({ until: v || null })} />
            )}
          </div>}
          {skippable && value.freq !== 'dates' && date && <SkipDates value={value} date={date} changed={skippable.changed} onChange={(exceptions) => set({ exceptions })} />}
          {hint && <p className={styles.hint}>{hint}</p>}
        </div>
      )}
    </div>
  );
}

const SKIP_PAGE = 20;
const SKIP_AHEAD_DAYS = 730;

// The dates a repeat falls on, from its first (or today, for one already under way), each ticked
// while it happens: unticking puts it in the rule's `exceptions` (as the calendar's "delete only
// this one" does, and a Schedule's skip list). A date skipped by a break or by an item in the
// class's place, or taken out as an item of its own, shows but stays as it is (2026-11-07).
function SkipDates({ value, date, changed, onChange }: { value: RepeatConfig; date: string; changed?: ReadonlySet<string>; onChange: (exceptions: string[]) => void }) {
  const L = LABELS.recurring;
  const [open, setOpen] = useState(false);
  const exceptions = useMemo(() => value.exceptions ?? [], [value.exceptions]);
  const locked = useMemo(() => {
    const out = new Map<string, string>();
    for (const d of value.breakSkips ?? []) out.set(d, L.skipLocked.breaks);
    for (const d of value.replacedSkips ?? []) out.set(d, L.skipLocked.replaced);
    for (const d of changed ?? []) out.set(d, L.skipLocked.changed);
    return out;
  }, [value.breakSkips, value.replacedSkips, changed, L]);
  const dates = useMemo(() => {
    const today = todayIso();
    const from = date > today ? date : today;
    const all = expandRepeat(date, { ...value, exceptions: [] }, from, addDaysToIso(from, SKIP_AHEAD_DAYS));
    return date >= from ? [date, ...all] : all;
  }, [value, date]);
  const own = exceptions.filter((d) => !locked.has(d));
  const toggle = (d: string) => onChange(exceptions.includes(d) ? exceptions.filter((x) => x !== d) : [...exceptions, d].sort());
  return (
    <div className={styles.skip}>
      <button type="button" className={styles.linkBtn} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <DisclosureIcon open={open} /> {L.skipDates}{own.length ? ` · ${L.skipCount(own.length)}` : ''}
      </button>
      {open && (
        <>
          <p className={styles.hint}>{L.skipHint}</p>
          <DateChecklist dates={dates} label={L.skipDates} pageSize={SKIP_PAGE} locked={locked} onToggle={toggle}
            checked={(d) => !exceptions.includes(d) || changed?.has(d) === true} />
        </>
      )}
    </div>
  );
}

// A repeat on a list of dates: each date with a way to take it off, and a field to add one. When
// the dates follow other events ("1 day before each lecture"), it says so and offers to stop; the
// dates then stay as they are and can be changed by hand (services/repeatFollow.ts keeps them in step).
function DatesList({ value, onChange, itemTime }: { value: RepeatConfig; onChange: (r: Partial<RepeatConfig>) => void; itemTime?: string | null }) {
  const L = LABELS.recurring;
  const events = useCalendarStore((s) => s.events);
  const [adding, setAdding] = useState('');
  const dates = value.dates ?? [];
  // With times (a calendar item): one line per date, its own time beside it (2026-11-07).
  const timed = itemTime !== undefined;
  const times = value.dateTimes ?? {};
  const setTime = (d: string, t: string) => onChange({ dateTimes: { ...times, [d]: t } });
  const followed = value.follows ? [...new Set(value.follows.ids.map((id) => events[id as never]?.title).filter(Boolean))].join(', ') : '';
  return (
    <div className={styles.dates}>
      {value.follows && (
        <div className={styles.row}>
          <span className={styles.small}>{L.follows(value.follows.offsetDays, followed || '…')}</span>
          <button type="button" className={styles.linkBtn} onClick={() => onChange({ follows: undefined })}>{L.stopFollowing}</button>
        </div>
      )}
      {timed && dates.length > 0 && <p className={styles.hint}>{L.dateTimeHint}</p>}
      <ul className={timed ? styles.dateRows : styles.dateList}>
        {dates.map((d) => (
          <li key={d} className={timed ? styles.dateRow : styles.dateChip}>
            {formatDate(d + 'T00:00:00')}
            {timed && !value.follows && (
              <TimeInput className={styles.dateTime} value={times[d] ?? ''} placeholder={itemTime ?? undefined} onChange={(t) => setTime(d, t)} />
            )}
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
