import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import { LABELS } from '@/config/labels';
import { todayIso } from '@/utils/date';
import styles from './MiniDatePicker.module.css';

// ── MiniDatePicker — the "Go to date" widget ────────────────────────────────
// A small local helper, deliberately not imported from CalendarView.tsx (which has its own
// very similar buildCalendarDays/toDateStr) — this is genuinely one real algorithm, but
// small enough, and specific enough to this one visual widget, that duplicating it here
// beat a cross-file refactor for a feature update that wasn't asked to touch CalendarView's
// existing month-grid logic.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildMonthGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(last);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const days: { date: Date; inMonth: boolean }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push({ date: new Date(cur), inMonth: cur.getMonth() === month });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export interface MiniDatePickerProps {
  // Which year/month the picker starts browsing at — re-syncs whenever this changes while
  // the pane is open (see the effect below), so it always reflects wherever the main
  // calendar currently is when you open it, rather than always resetting to today.
  anchorDate: string;
  onSelect: (date: string) => void;
}

// A compact visual date picker built specifically to make large jumps easy — the year row's
// «/» step by 10, ‹/› by 1, and the year itself is a plain number input you can type directly
// into (e.g. to jump to 2040 in one edit) — rather than relying on a native date input,
// whose browser-native dropdown calendar has no fast way to move more than one month at a time.
export function MiniDatePicker({ anchorDate, onSelect }: MiniDatePickerProps) {
  const anchor = new Date(`${anchorDate}T00:00:00`);
  const [viewYear, setViewYear]   = useState(anchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getMonth());
  // Re-syncs viewYear/viewMonth whenever anchorDate changes (e.g. the main calendar was
  // navigated via its own prev/next arrows while this pane stayed open) — adjusted during
  // render itself (React's documented pattern for "reset state when a prop changes")
  // rather than a useEffect, which would need an extra render pass to take effect and
  // would flag as an avoidable set-state-in-effect.
  const [lastAnchor, setLastAnchor] = useState(anchorDate);
  if (anchorDate !== lastAnchor) {
    setLastAnchor(anchorDate);
    setViewYear(anchor.getFullYear());
    setViewMonth(anchor.getMonth());
  }

  const days = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = todayIso();

  // Every navigation control here (year/month arrows, the month dropdown, a typed year on
  // Enter/blur) moves the calendar itself immediately, not just this widget's own view — the
  // day-of-month carried over is the calendar's current one, clamped to the new month's length
  // (month view always anchors on the 1st, so it is unaffected). Picking a day in the grid
  // still jumps to that exact date.
  const goTo = (year: number, month: number) => {
    setViewYear(year);
    setViewMonth(month);
    const day = Math.min(anchor.getDate(), new Date(year, month + 1, 0).getDate());
    onSelect(`${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };
  const shiftYear = (delta: number) => goTo(viewYear + delta, viewMonth);
  // Stepping past December/January rolls the year over, so ‹/› can be held to scroll through time.
  const shiftMonth = (delta: number) => {
    const idx = viewYear * 12 + viewMonth + delta;
    goTo(Math.floor(idx / 12), ((idx % 12) + 12) % 12);
  };
  const commitTypedYear = () => {
    if (Number.isInteger(viewYear) && viewYear >= 1 && viewYear <= 9999 && viewYear !== anchor.getFullYear()) goTo(viewYear, viewMonth);
  };

  return (
    <div className={styles.picker}>
      <div className={styles.pickerYearRow}>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftYear(-10)} title="10 years back">«</button>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftYear(-1)} title="1 year back">‹</button>
        <input
          type="number"
          className={styles.pickerYearInput}
          value={viewYear}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) setViewYear(v);
          }}
          onBlur={commitTypedYear}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          aria-label="Year"
        />
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftYear(1)} title="1 year forward">›</button>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftYear(10)} title="10 years forward">»</button>
      </div>

      <div className={styles.pickerMonthRow}>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftMonth(-1)} title="Previous month" aria-label="Previous month">‹</button>
        <select
          className={styles.pickerMonthSelect}
          value={viewMonth}
          onChange={(e) => goTo(viewYear, Number(e.target.value))}
          aria-label="Month"
        >
          {MONTH_NAMES.map((name, i) => <option key={name} value={i}>{name}</option>)}
        </select>
        <button type="button" className={styles.pickerStepBtn} onClick={() => shiftMonth(1)} title="Next month" aria-label="Next month">›</button>
      </div>

      <div className={styles.pickerDayLabels}>
        {DAY_LETTERS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className={styles.pickerGrid}>
        {days.map(({ date, inMonth }, i) => {
          const ds = toDateStr(date);
          const isToday  = ds === today;
          const isAnchor = ds === anchorDate;
          return (
            <button
              key={i}
              type="button"
              data-picker-day=""
              className={[
                styles.pickerDay,
                !inMonth ? styles.pickerDayOther : '',
                isToday ? styles.pickerDayToday : '',
                isAnchor ? styles.pickerDaySelected : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect(ds)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The same picker in a popover, from the calendar header's period title (asked for by the user
// 2026-10-22: clicking the month, week or day opens it). Moving by year or month moves the calendar
// at once, as in the side pane; picking a day goes there and closes it.
export function MiniDatePickerPopover({ anchor, anchorDate, onSelect, onClose }: {
  anchor: AnchorBox; anchorDate: string; onSelect: (date: string) => void; onClose: () => void;
}) {
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchor, { gap: 6, align: 'center' });
  useEscapeClose(onClose);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose, ref]);
  return createPortal(
    <div ref={ref} className={styles.popover} style={style} role="dialog" aria-label={LABELS.calendarNav.goTo}
      onClick={(e) => { if ((e.target as Element).closest('[data-picker-day]')) onClose(); }}>
      <MiniDatePicker anchorDate={anchorDate} onSelect={onSelect} />
    </div>,
    document.body,
  );
}
