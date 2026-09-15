import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import styles from './TimeInput.module.css';

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

// Native <input type="time"> ignores our app's clock-format setting: its 12h/24h display is
// tied to the browser/OS locale, and no HTML attribute (lang included, despite older folklore)
// reliably overrides that in current Chromium/Edge. Built from scratch instead — separate
// hour/minute number fields (+ an AM/PM toggle in 12h mode) — so the setting is authoritative.
// The outgoing value is always canonical 24-hour "HH:MM", same contract a native input had.
export function TimeInput({ className, value, onChange, placeholder }: Props) {
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const use12Hour = clockFormat === '12h' || (clockFormat === 'system' && systemUses12Hour());

  const [h, m] = value ? value.split(':').map(Number) : [null, null];
  const has12 = h !== null && !Number.isNaN(h) ? to12(h) : null;

  const [hourStr, setHourStr] = useState(
    h === null || Number.isNaN(h) ? '' : String(use12Hour ? has12!.hour12 : h)
  );
  const [minuteStr, setMinuteStr] = useState(m === null || Number.isNaN(m) ? '' : pad(m));
  const [meridiem, setMeridiem]   = useState<'AM' | 'PM'>(has12?.meridiem ?? 'AM');

  // Re-sync internal segments when the value changes externally (e.g. form reset, editing a
  // different item) or when the 12h/24h format itself changes, so displayed digits stay correct.
  useEffect(() => {
    const [nh, nm] = value ? value.split(':').map(Number) : [null, null];
    if (nh === null || Number.isNaN(nh)) {
      setHourStr('');
      setMinuteStr('');
      return;
    }
    const n12 = to12(nh);
    setHourStr(String(use12Hour ? n12.hour12 : nh));
    setMinuteStr(pad(nm ?? 0));
    setMeridiem(n12.meridiem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, use12Hour]);

  const commit = (nextHourStr: string, nextMinuteStr: string, nextMeridiem: 'AM' | 'PM') => {
    if (nextHourStr === '' || nextMinuteStr === '') { onChange(''); return; }
    const hourNum = Number(nextHourStr);
    const minuteNum = Number(nextMinuteStr);
    if (Number.isNaN(hourNum) || Number.isNaN(minuteNum)) return;
    const hour24 = use12Hour ? to24(hourNum, nextMeridiem) : hourNum;
    onChange(`${pad(hour24)}:${pad(minuteNum)}`);
  };

  const handleHourChange = (raw: string) => {
    const max = use12Hour ? 12 : 23;
    const min = use12Hour ? 1 : 0;
    if (raw !== '' && (Number(raw) > max || Number(raw) < 0)) return;
    setHourStr(raw);
    commit(raw === '' ? '' : String(Math.max(min, Number(raw))), minuteStr, meridiem);
  };

  const handleMinuteChange = (raw: string) => {
    if (raw !== '' && (Number(raw) > 59 || Number(raw) < 0)) return;
    setMinuteStr(raw);
    commit(hourStr, raw, meridiem);
  };

  const handleMeridiem = (next: 'AM' | 'PM') => {
    setMeridiem(next);
    commit(hourStr, minuteStr, next);
  };

  return (
    <div className={`${className ?? ''} ${styles.wrapper}`} title={placeholder}>
      <input
        type="number"
        className={styles.segment}
        value={hourStr}
        onChange={(e) => handleHourChange(e.target.value)}
        placeholder="--"
        min={use12Hour ? 1 : 0}
        max={use12Hour ? 12 : 23}
        aria-label="Hour"
      />
      <span className={styles.sep}>:</span>
      <input
        type="number"
        className={styles.segment}
        value={minuteStr}
        onChange={(e) => handleMinuteChange(e.target.value)}
        placeholder="--"
        min={0}
        max={59}
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
    </div>
  );
}
