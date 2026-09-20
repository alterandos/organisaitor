import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { formatTime } from '@/utils/date';
import styles from './TimeInput.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

interface Props {
  className?:  string;
  value:       string; // HH:MM, 24-hour canonical, '' = unset
  onChange:    (value: string) => void;
  placeholder?: string;
}

function systemUses12Hour(): boolean {
  try {
    const hourCycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hourCycle === 'h11' || hourCycle === 'h12';
  } catch {
    return true;
  }
}

function to12(hour24: number): { hour12: number; meridiem: 'AM' | 'PM' } {
  const meridiem = hour24 < 12 ? 'AM' : 'PM';
  const hour12   = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, meridiem };
}

function to24(hour12: number, meridiem: 'AM' | 'PM'): number {
  if (meridiem === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

const pad = (n: number) => String(n).padStart(2, '0');

// Every half hour across the day, for the quick-pick dropdown below.
const QUICK_PICK_MINUTES = Array.from({ length: 48 }, (_, i) => i * 30);
const minutesToHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// Native <input type="time"> ignores our app's clock-format setting: its 12h/24h display is
// tied to the browser/OS locale, and no HTML attribute (lang included, despite older folklore)
// reliably overrides that in current Chromium/Edge. Built from scratch instead: separate
// hour/minute segments (+ AM/PM toggle in 12h mode) that validate as you type, plus a quick-pick
// dropdown of common times (the "combobox" pattern Google Calendar/Notion use) for one-click
// entry. The outgoing value is always canonical 24-hour "HH:MM", same contract a native input had.
//
// Segment typing rules (deliberately stricter than "just don't overflow"): each segment always
// resolves to a definite two-digit value before advancing, and an entry that can never become
// valid is rejected immediately with visible feedback (a brief red flash) rather than silently
// swallowing the keystroke — the old plain <input type="number"> version did the latter, which
// read as "my keypress didn't register" with no explanation.
export function TimeInput({ className, value, onChange, placeholder }: Props) {
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const use12Hour = clockFormat === '12h' || (clockFormat === 'system' && systemUses12Hour());

  const [h, m] = value ? value.split(':').map(Number) : [null, null];
  const has12 = h !== null && !Number.isNaN(h) ? to12(h) : null;

  const [hourStr, setHourStr] = useState(
    h === null || Number.isNaN(h) ? '' : (use12Hour ? String(has12!.hour12) : pad(h))
  );
  const [minuteStr, setMinuteStr] = useState(m === null || Number.isNaN(m) ? '' : pad(m));
  const [meridiem, setMeridiem]   = useState<'AM' | 'PM'>(has12?.meridiem ?? 'AM');
  const [hourError, setHourError]     = useState(false);
  const [minuteError, setMinuteError] = useState(false);
  const [open, setOpen] = useState(false);

  const hourRef    = useRef<HTMLInputElement>(null);
  const minuteRef  = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);
  // Set right before an auto-advance shifts focus from hour to minute, so the blur that
  // shifting causes doesn't also re-commit — a redundant-but-value-identical onChange still has
  // real side effects one level up (e.g. AddCalendarItemModal re-deriving a linked end time off
  // whatever the end time has *already become*), so "harmless because idempotent" doesn't hold.
  const skipHourBlurCommitRef = useRef(false);

  // Re-sync internal segments when the value changes externally (e.g. form reset, editing a
  // different item, a linked start/end auto-adjustment from elsewhere) or when the 12h/24h
  // format itself changes, so displayed digits stay correct. Adjusts state during render (keyed on
  // value + format) rather than in an effect.
  const syncKey = `${value ?? ''}|${use12Hour}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    const [nh, nm] = value ? value.split(':').map(Number) : [null, null];
    if (nh === null || Number.isNaN(nh)) {
      setHourStr('');
      setMinuteStr('');
    } else {
      const n12 = to12(nh);
      setHourStr(use12Hour ? String(n12.hour12) : pad(nh));
      setMinuteStr(pad(nm ?? 0));
      setMeridiem(n12.meridiem);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEscapeClose(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const flashError = (which: 'hour' | 'minute') => {
    if (which === 'hour') {
      setHourError(true);
      setTimeout(() => setHourError(false), 420);
    } else {
      setMinuteError(true);
      setTimeout(() => setMinuteError(false), 420);
    }
  };

  const commit = (nextHourStr: string, nextMinuteStr: string, nextMeridiem: 'AM' | 'PM') => {
    if (nextHourStr === '' || nextMinuteStr === '') return;
    const hourNum = Number(nextHourStr);
    const minuteNum = Number(nextMinuteStr);
    if (Number.isNaN(hourNum) || Number.isNaN(minuteNum)) return;
    const hour24 = use12Hour ? to24(hourNum, nextMeridiem) : hourNum;
    onChange(`${pad(hour24)}:${pad(minuteNum)}`);
  };

  const handleHourFocus = () => {
    hourRef.current?.select();
    if (minuteStr === '') setMinuteStr('00'); // clicking into an empty hour defaults minutes to :00
    setOpen(true);
  };

  const handleMinuteFocus = () => {
    minuteRef.current?.select();
    setOpen(true);
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const next = hourStr.slice(0, -1);
      setHourStr(next);
      if (next === '') onChange('');
      return;
    }
    if (e.key === 'Tab' || e.key === 'Enter' || e.key.startsWith('Arrow')) return;
    if (!/^[0-9]$/.test(e.key)) { e.preventDefault(); return; }
    e.preventDefault();

    const buffer = (hourStr.length >= 2 ? '' : hourStr) + e.key;
    const value  = Number(buffer);
    const max    = use12Hour ? 12 : 23;

    // 24h hour values only ever start with 0/1/2 — no valid HH begins any higher.
    if (!use12Hour && buffer.length === 1 && value > 2) {
      flashError('hour');
      setHourStr('');
      onChange('');
      return;
    }
    if (value > max) {
      flashError('hour');
      setHourStr('');
      onChange('');
      return;
    }
    setHourStr(buffer);

    // Auto-advance once the segment is unambiguous: either two digits are in, or (12h only) a
    // single digit that can't extend to a valid second digit anyway (e.g. "3".."9" — no 12h
    // hour lives in the 30s-90s), so it's already the final value.
    const singleDigitFinal = use12Hour && buffer.length === 1 && value !== 0 && value * 10 > max;
    if (buffer.length === 2 || singleDigitFinal) {
      const nextMinute = minuteStr === '' ? '00' : minuteStr;
      setMinuteStr(nextMinute);
      commit(buffer, nextMinute, meridiem);
      skipHourBlurCommitRef.current = true;
      minuteRef.current?.focus();
      minuteRef.current?.select();
    }
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const next = minuteStr.slice(0, -1);
      setMinuteStr(next);
      if (next === '') onChange('');
      return;
    }
    if (e.key === 'Tab' || e.key === 'Enter' || e.key.startsWith('Arrow')) return;
    if (!/^[0-9]$/.test(e.key)) { e.preventDefault(); return; }
    e.preventDefault();

    const buffer = (minuteStr.length >= 2 ? '' : minuteStr) + e.key;
    const value  = Number(buffer);

    // Minute values only ever start with 0-5 (tens digit) — anything higher can never stay ≤59.
    if (buffer.length === 1 && value > 5) {
      flashError('minute');
      setMinuteStr('');
      onChange('');
      return;
    }
    if (value > 59) {
      flashError('minute');
      setMinuteStr('');
      onChange('');
      return;
    }
    setMinuteStr(buffer);
    if (buffer.length === 2) commit(hourStr, buffer, meridiem);
  };

  // Finalizes a lone typed digit left in a segment on blur (e.g. "1" meaning 1 o'clock in 12h
  // mode, never auto-advanced because "10"/"11"/"12" were still possible completions).
  const handleHourBlur = () => {
    if (skipHourBlurCommitRef.current) { skipHourBlurCommitRef.current = false; return; }
    if (hourStr === '') return;
    const padded = use12Hour ? hourStr : pad(Number(hourStr));
    setHourStr(padded);
    commit(padded, minuteStr === '' ? '00' : minuteStr, meridiem);
    if (minuteStr === '') setMinuteStr('00');
  };

  const handleMinuteBlur = () => {
    if (minuteStr === '') return;
    const padded = pad(Number(minuteStr));
    setMinuteStr(padded);
    commit(hourStr, padded, meridiem);
  };

  const handleMeridiem = (next: 'AM' | 'PM') => {
    setMeridiem(next);
    commit(hourStr, minuteStr, next);
  };

  const pickTime = (hhmm: string) => {
    const [ph, pm] = hhmm.split(':').map(Number);
    const p12 = to12(ph);
    setHourStr(String(use12Hour ? p12.hour12 : ph));
    setMinuteStr(pad(pm));
    setMeridiem(p12.meridiem);
    onChange(hhmm);
    setOpen(false);
  };

  const clearTime = () => {
    setHourStr('');
    setMinuteStr('');
    onChange('');
    setOpen(false);
  };

  return (
    <div className={`${className ?? ''} ${styles.wrapper}`} title={placeholder} ref={wrapperRef}>
      <input
        ref={hourRef}
        type="text"
        inputMode="numeric"
        className={`${styles.segment} ${hourError ? styles.segmentError : ''}`}
        value={hourStr}
        onFocus={handleHourFocus}
        onKeyDown={handleHourKeyDown}
        onBlur={handleHourBlur}
        onChange={() => {}}
        placeholder="--"
        aria-label="Hour"
      />
      <span className={styles.sep}>:</span>
      <input
        ref={minuteRef}
        type="text"
        inputMode="numeric"
        className={`${styles.segment} ${minuteError ? styles.segmentError : ''}`}
        value={minuteStr}
        onFocus={handleMinuteFocus}
        onKeyDown={handleMinuteKeyDown}
        onBlur={handleMinuteBlur}
        onChange={() => {}}
        placeholder="--"
        aria-label="Minute"
      />
      {use12Hour && (
        <div className={styles.meridiemToggle}>
          {(['AM', 'PM'] as const).map((mer) => (
            <button
              key={mer}
              type="button"
              className={`${styles.meridiemBtn} ${meridiem === mer ? styles.meridiemBtnActive : ''}`}
              onClick={() => handleMeridiem(mer)}
            >
              {mer}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={styles.dropdownToggle}
        aria-label="Choose a time"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>

      {open && (
        <div className={styles.dropdown} ref={listRef} role="listbox">
          {value && (
            <button type="button" className={`${styles.dropdownItem} ${styles.dropdownClear}`} onClick={clearTime}>
              Clear
            </button>
          )}
          {QUICK_PICK_MINUTES.map((min) => {
            const hhmm = minutesToHHMM(min);
            const active = value === hhmm;
            return (
              <button
                key={min}
                type="button"
                role="option"
                aria-selected={active}
                data-active={active || undefined}
                className={`${styles.dropdownItem} ${active ? styles.dropdownItemActive : ''}`}
                onClick={() => pickTime(hhmm)}
              >
                {formatTime(hhmm, clockFormat)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
