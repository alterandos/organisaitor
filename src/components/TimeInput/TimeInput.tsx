import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '@/store/settingsStore';
import { formatTime } from '@/utils/date';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import { LABELS } from '@/config/labels';
import styles from './TimeInput.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { CloseIcon } from '@/components/Icons';
import { focusNextAfter } from '@/utils/focusNext';
import { useWheelSteps } from '@/hooks/useWheelSteps';
import { SegmentStepper } from './SegmentStepper';

interface Props {
  className?:  string;
  value:       string; // HH:MM, 24-hour canonical, '' = unset
  onChange:    (value: string) => void;
  placeholder?: string;
}

type Meridiem = 'AM' | 'PM';
type Segment = 'hour' | 'minute' | 'meridiem';

const L = LABELS.timeInput;

function systemUses12Hour(): boolean {
  try {
    const hourCycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hourCycle === 'h11' || hourCycle === 'h12';
  } catch {
    return true; // no Intl hour cycle (very old engines): 12-hour is the likelier default
  }
}

function to12(hour24: number): { hour12: number; meridiem: Meridiem } {
  const meridiem = hour24 < 12 ? 'AM' : 'PM';
  const hour12   = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, meridiem };
}

function to24(hour12: number, meridiem: Meridiem): number {
  if (meridiem === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

const pad = (n: number) => String(n).padStart(2, '0');

// Every half hour across the day, for the quick-pick dropdown below.
const QUICK_PICK_MINUTES = Array.from({ length: 48 }, (_, i) => i * 30);
const minutesToHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// The wheel and the ▲▼ buttons move minutes in fives (to the next multiple of 5); arrow keys by one.
const MINUTE_STEP = 5;

// THE time field for the whole suite (every time of day the person enters goes through it; the
// pattern test allows no native type="time"). Native <input type="time"> ignores the app's clock
// setting, so it's built from segments: hour, minute, and AM/PM in 12-hour mode. The rules
// (agreed with the user 2026-10-22):
//   • Each segment is typed on its own, in either order: typing the minutes first, then the hour,
//     never wipes the minutes (an incomplete time is reported as '' upward, but the segments keep
//     what was typed: `emittedRef` tells our own '' apart from a reset from outside).
//   • Tab / Shift+Tab move hour → minute → AM/PM and on out of the field (the ▾, ✕ and ▲▼ buttons
//     are out of the Tab order); ← → move between segments too.
//   • Too big a number becomes the largest allowed, selected, so typing again replaces it
//     (12h "14" → 12, 24h "25" → 23, minutes "77" → 59).
//   • A complete segment moves on by itself: the hour to the minutes (a digit no hour can continue,
//     "3", is complete at once), the minutes to AM/PM, or in 24-hour mode to the next control
//     after the field (to the hour if it's still empty).
//   • The wheel over a segment, ↑ ↓, and the ▲▼ buttons shown on hover all step it (minutes by 5
//     with the wheel and buttons, by 1 with the arrows). Stepping the hour past 11 / 12 changes AM/PM.
// The outgoing value is always canonical 24-hour "HH:MM", the contract a native input had.
export function TimeInput({ className, value, onChange, placeholder }: Props) {
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const use12Hour = clockFormat === '12h' || (clockFormat === 'system' && systemUses12Hour());

  const parse = (v: string) => {
    const [ph, pm] = v ? v.split(':').map(Number) : [NaN, NaN];
    if (Number.isNaN(ph)) return null;
    const p12 = to12(ph);
    return { hourStr: use12Hour ? String(p12.hour12) : pad(ph), minuteStr: pad(Number.isNaN(pm) ? 0 : pm), meridiem: p12.meridiem };
  };
  const initial = parse(value);

  const [hourStr, setHourStr]     = useState(initial?.hourStr ?? '');
  const [minuteStr, setMinuteStr] = useState(initial?.minuteStr ?? '');
  const [meridiem, setMeridiem]   = useState<Meridiem>(initial?.meridiem ?? 'AM');
  const [flash, setFlash] = useState<Segment | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);

  const hourRef     = useRef<HTMLInputElement>(null);
  const minuteRef   = useRef<HTMLInputElement>(null);
  const meridiemRef = useRef<HTMLButtonElement>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const { ref: listRef, style: listStyle } = useFloatingPlacement<HTMLDivElement>(open ? anchor : null, { gap: 4 });
  // The last value this field reported. When `value` comes back as exactly that, it's our own
  // echo (often '' for a half-typed time), not a reset from outside, so the segments stay.
  const [emitted, setEmitted] = useState(value);
  // Set right before moving focus on by itself, so the blur that causes doesn't commit again:
  // a value-identical onChange still has side effects one level up (AddCalendarItemModal
  // re-deriving a linked end time), so "harmless because idempotent" doesn't hold.
  const skipBlurCommitRef = useRef(false);
  // True from focus (which selects the segment's text) until the first keystroke: the first digit
  // then replaces the segment, and the first Backspace clears the whole time.
  const freshRef = useRef<Segment | null>(null);

  // Re-sync the segments when the value changes from outside (a form reset, another item, a linked
  // start/end adjustment) or when the 12h/24h format changes. Adjusted during render, not in an effect.
  const syncKey = `${value ?? ''}|${use12Hour}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    const isEcho = value === emitted && syncedKey.endsWith(`|${use12Hour}`);
    setEmitted(value);
    if (!isEcho) {
      const p = parse(value);
      setHourStr(p?.hourStr ?? '');
      setMinuteStr(p?.minuteStr ?? '');
      if (p) setMeridiem(p.meridiem);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, listRef]);

  useEscapeClose(() => setOpen(false), open);

  useLayoutEffect(() => {
    if (!open) return;
    const r = wrapperRef.current?.getBoundingClientRect();
    if (r) setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [open, listRef]);

  const emit = (v: string) => {
    setEmitted(v);
    onChange(v);
  };

  const flashSegment = (which: Segment) => {
    setFlash(which);
    setTimeout(() => setFlash((f) => (f === which ? null : f)), 420);
  };

  const commit = (h: string, m: string, mer: Meridiem) => {
    if (h === '' || m === '') return;
    const hourNum = Number(h);
    const minuteNum = Number(m);
    if (Number.isNaN(hourNum) || Number.isNaN(minuteNum)) return;
    emit(`${pad(use12Hour ? to24(hourNum, mer) : hourNum)}:${pad(minuteNum)}`);
  };

  const uncommit = () => { if (emitted !== '') emit(''); };

  const focusSegment = (which: Segment) => {
    skipBlurCommitRef.current = true;
    const el = which === 'hour' ? hourRef.current : which === 'minute' ? minuteRef.current : meridiemRef.current;
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
    skipBlurCommitRef.current = false;
  };

  const moveOn = () => {
    setOpen(false);
    if (wrapperRef.current) {
      skipBlurCommitRef.current = true;
      focusNextAfter(wrapperRef.current);
      skipBlurCommitRef.current = false;
    }
  };

  const reselect = (el: HTMLInputElement | null, which: Segment) => {
    freshRef.current = which;
    requestAnimationFrame(() => el?.select());
  };

  // ── Stepping (wheel, arrows, ▲▼) ──
  const currentHour24 = (): number | null => {
    if (hourStr === '') return null;
    const n = Number(hourStr);
    return use12Hour ? to24(n, meridiem) : n;
  };

  const stepHour = (delta: number) => {
    const base = currentHour24() ?? new Date().getHours();
    const next = (((hourStr === '' ? base : base + delta) % 24) + 24) % 24;
    const p12 = to12(next);
    const h = use12Hour ? String(p12.hour12) : pad(next);
    const m = minuteStr === '' ? '00' : minuteStr;
    setHourStr(h);
    setMinuteStr(m);
    setMeridiem(p12.meridiem);
    commit(h, m, p12.meridiem);
  };

  const stepMinute = (delta: number, step: number) => {
    let next: number;
    if (minuteStr === '') next = 0;
    else {
      const cur = Number(minuteStr);
      next = delta > 0 ? Math.floor(cur / step) * step + step : Math.ceil(cur / step) * step - step;
    }
    next = ((next % 60) + 60) % 60;
    setMinuteStr(pad(next));
    commit(hourStr, pad(next), meridiem);
  };

  const toggleMeridiem = (next?: Meridiem) => {
    const mer = next ?? (meridiem === 'AM' ? 'PM' : 'AM');
    setMeridiem(mer);
    commit(hourStr, minuteStr, mer);
  };

  // The wheel over a segment steps it (minutes by 5).
  useWheelSteps([hourRef, minuteRef, meridiemRef], (i, dir) => {
    if (i === 0) stepHour(dir);
    else if (i === 1) stepMinute(dir, MINUTE_STEP);
    else toggleMeridiem();
  }, [use12Hour]);

  // Keys that aren't the field's business (Tab, shortcuts) go on as normal; so does any other
  // named key the handlers below don't take (Esc, Home…): only typed characters are stopped.
  const passThrough = (e: React.KeyboardEvent) => e.key === 'Tab' || e.ctrlKey || e.metaKey || e.altKey;

  const handleHourFocus = () => {
    hourRef.current?.select();
    freshRef.current = 'hour';
    setOpen(true);
  };

  const handleMinuteFocus = () => {
    minuteRef.current?.select();
    freshRef.current = 'minute';
    setOpen(true);
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const fresh = freshRef.current === 'hour';
    freshRef.current = null;
    if (passThrough(e)) return;
    if (e.key === 'Delete' || (e.key === 'Backspace' && fresh && hourStr !== '')) {
      e.preventDefault();
      clearTime();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      setHourStr(hourStr.slice(0, -1));
      uncommit();
      return;
    }
    if (e.key === 'Enter') {
      // Accept what's typed and move on (the blur pads a lone digit); never submit a form.
      e.preventDefault();
      if (hourStr !== '') minuteRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stepHour(e.key === 'ArrowUp' ? 1 : -1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); minuteRef.current?.focus(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); return; }
    if (e.key.length !== 1) return;
    e.preventDefault();
    if (!/^[0-9]$/.test(e.key)) return;

    const buffer = (fresh || hourStr.length >= 2 ? '' : hourStr) + e.key;
    const n   = Number(buffer);
    const max = use12Hour ? 12 : 23;
    const minuteNext = minuteStr === '' ? '00' : minuteStr;

    if (buffer.length === 2 && (n > max || (use12Hour && n === 0))) {
      const clamped = use12Hour ? '12' : '23';
      setHourStr(clamped);
      setMinuteStr(minuteNext);
      commit(clamped, minuteNext, meridiem);
      flashSegment('hour');
      reselect(hourRef.current, 'hour');
      return;
    }
    // Complete once two digits are in, or a single digit no second digit could continue
    // ("3": no hour lives in the 30s), which is already the final value.
    const complete = buffer.length === 2 || (n !== 0 && n * 10 > max);
    if (!complete) { setHourStr(buffer); return; }
    const h = use12Hour ? String(n) : pad(n);
    setHourStr(h);
    setMinuteStr(minuteNext);
    commit(h, minuteNext, meridiem);
    focusSegment('minute');
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const fresh = freshRef.current === 'minute';
    freshRef.current = null;
    if (passThrough(e)) return;
    if (e.key === 'Delete' || (e.key === 'Backspace' && fresh && minuteStr !== '')) {
      e.preventDefault();
      clearTime();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      setMinuteStr(minuteStr.slice(0, -1));
      uncommit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      setOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stepMinute(e.key === 'ArrowUp' ? 1 : -1, 1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); hourRef.current?.focus(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); if (use12Hour) meridiemRef.current?.focus(); return; }
    if (e.key.length !== 1) return;
    e.preventDefault();
    if (!/^[0-9]$/.test(e.key)) return;

    const buffer = (fresh || minuteStr.length >= 2 ? '' : minuteStr) + e.key;
    if (buffer.length === 1) { setMinuteStr(buffer); return; }
    if (Number(buffer) > 59) {
      setMinuteStr('59');
      commit(hourStr, '59', meridiem);
      flashSegment('minute');
      reselect(minuteRef.current, 'minute');
      return;
    }
    setMinuteStr(buffer);
    commit(hourStr, buffer, meridiem);
    if (hourStr === '') focusSegment('hour');
    else if (use12Hour) focusSegment('meridiem');
    else moveOn();
  };

  const handleMeridiemKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (passThrough(e)) return;
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'p') { e.preventDefault(); toggleMeridiem(k === 'a' ? 'AM' : 'PM'); moveOn(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); toggleMeridiem(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); minuteRef.current?.focus(); return; }
  };

  // Finalizes a lone typed digit left in a segment on blur (e.g. "1" meaning 1 o'clock in 12h
  // mode, never auto-advanced because "10"/"11"/"12" were still possible completions).
  const handleHourBlur = () => {
    if (skipBlurCommitRef.current || hourStr === '') return;
    const padded = use12Hour ? String(Number(hourStr) || 12) : pad(Number(hourStr));
    const m = minuteStr === '' ? '00' : minuteStr;
    setHourStr(padded);
    setMinuteStr(m);
    commit(padded, m, meridiem);
  };

  const handleMinuteBlur = () => {
    if (skipBlurCommitRef.current || minuteStr === '') return;
    const padded = pad(Number(minuteStr));
    setMinuteStr(padded);
    commit(hourStr, padded, meridiem);
  };

  // Leaving the field (Tab, a click elsewhere) closes the quick-pick list.
  const handleWrapperBlur = (e: React.FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (wrapperRef.current?.contains(to) || listRef.current?.contains(to))) return;
    setOpen(false);
  };

  const pickTime = (hhmm: string) => {
    const p = parse(hhmm)!;
    setHourStr(p.hourStr);
    setMinuteStr(p.minuteStr);
    setMeridiem(p.meridiem);
    emit(hhmm);
    setOpen(false);
  };

  const clearTime = () => {
    setHourStr('');
    setMinuteStr('');
    emit('');
    setOpen(false);
  };

  return (
    <div className={`${className ?? ''} ${styles.wrapper}`} title={placeholder} ref={wrapperRef} onBlur={handleWrapperBlur}>
      <span className={styles.segWrap}>
        <input
          ref={hourRef}
          type="text"
          inputMode="numeric"
          className={`${styles.segment} ${flash === 'hour' ? styles.segmentError : ''}`}
          value={hourStr}
          onFocus={handleHourFocus}
          onKeyDown={handleHourKeyDown}
          onBlur={handleHourBlur}
          onChange={() => {}}
          placeholder="--"
          aria-label={L.hour}
        />
        <SegmentStepper label={L.hour.toLowerCase()} onUp={() => stepHour(1)} onDown={() => stepHour(-1)} />
      </span>
      <span className={styles.sep}>:</span>
      <span className={styles.segWrap}>
        <input
          ref={minuteRef}
          type="text"
          inputMode="numeric"
          className={`${styles.segment} ${flash === 'minute' ? styles.segmentError : ''}`}
          value={minuteStr}
          onFocus={handleMinuteFocus}
          onKeyDown={handleMinuteKeyDown}
          onBlur={handleMinuteBlur}
          onChange={() => {}}
          placeholder="--"
          aria-label={L.minute}
        />
        <SegmentStepper label={L.minute.toLowerCase()} onUp={() => stepMinute(1, MINUTE_STEP)} onDown={() => stepMinute(-1, MINUTE_STEP)} />
      </span>
      {use12Hour && (
        <button
          ref={meridiemRef}
          type="button"
          className={styles.meridiem}
          aria-label={L.meridiem(meridiem)}
          title={L.meridiemHint}
          onKeyDown={handleMeridiemKeyDown}
          onClick={() => toggleMeridiem()}
        >
          {meridiem}
        </button>
      )}
      {value && (
        <button
          type="button"
          tabIndex={-1}
          className={styles.clearBtn}
          aria-label={L.clear}
          onClick={clearTime}
        >
          <CloseIcon />
        </button>
      )}
      <button
        type="button"
        tabIndex={-1}
        className={styles.dropdownToggle}
        aria-label={L.choose}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>

      {open && createPortal(
        <div className={styles.dropdown} ref={listRef} style={listStyle} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {value && (
            <button type="button" tabIndex={-1} className={`${styles.dropdownItem} ${styles.dropdownClear}`} onClick={clearTime}>
              {L.clearShort}
            </button>
          )}
          {QUICK_PICK_MINUTES.map((min) => {
            const hhmm = minutesToHHMM(min);
            const active = value === hhmm;
            return (
              <button
                key={min}
                type="button"
                tabIndex={-1}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
