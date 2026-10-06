import { useState } from 'react';
import { AllDayNotifyField } from '@/components/AllDayNotifyField/AllDayNotifyField';
import { LABELS } from '@/config/labels';
import type { NotifyUnit } from '@/types';
import { formatObjectTime } from './format';
import styles from './ObjectBody.module.css';

const L = LABELS.noteObjects.body;
const BELL = '🔔';

// Esc closes the little editor (and nothing around it).
const closeOnEscape = (close: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
};

// A Deadline (always) or a whole-day Reminder: told "N days before, at a time". It can't be off —
// the calendar always notifies these — so it's a setting shown as a chip, click to change.
export function LeadNotifyChip({ daysBefore, atTime, onChange }: { daysBefore: number; atTime: string; onChange: (daysBefore: number, atTime: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <span className={styles.settingEditor} onKeyDown={closeOnEscape(() => setEditing(false))}>
        {BELL}
        <AllDayNotifyField daysBefore={daysBefore} atTime={atTime} onChange={onChange} />
        <button type="button" className={styles.settingBtn} onClick={() => setEditing(false)}>{L.notifyDone}</button>
      </span>
    );
  }
  return (
    <button type="button" className={styles.setting} title={L.notifyTitle} onClick={() => setEditing(true)}>
      {BELL} {L.notifyDays(daysBefore, formatObjectTime(atTime))}
    </button>
  );
}

const UNITS: NotifyUnit[] = ['minutes', 'hours', 'days'];
const unitName = (value: number, unit: NotifyUnit) => (value === 1 ? L.notifyUnits[unit].replace(/s$/, '') : L.notifyUnits[unit]);

// An Event: being told beforehand is opt-in. Off, it's offered greyed in the bottom bar
// (NotifyMeOption, which turns it on: an hour before, the Add Calendar Item default); on, it's a chip
// in the second heading line showing how long before — click to change or turn off.
export function NotifyMeOption({ onTurnOn }: { onTurnOn: () => void }) {
  return (
    <button type="button" className={`${styles.ghost} ${styles.offOption}`} title={L.turnOn(L.notifyMe)} onClick={onTurnOn}>
      <span className={styles.offIcon}>{BELL}</span> {L.notifyMe}
    </button>
  );
}

export function BeforeNotifyChip({ value, unit, onChange }: { value: number | null; unit: NotifyUnit; onChange: (value: number | null, unit: NotifyUnit) => void }) {
  const [editing, setEditing] = useState(false);
  if (value === null) return null;
  if (editing) {
    return (
      <span className={styles.settingEditor} onKeyDown={closeOnEscape(() => setEditing(false))}>
        {BELL}
        <input
          type="number"
          min={1}
          value={value}
          autoFocus
          onChange={(e) => { const n = Math.max(1, Math.round(Number(e.target.value) || 1)); onChange(n, unit); }}
        />
        <select value={unit} onChange={(e) => onChange(value, e.target.value as NotifyUnit)}>
          {UNITS.map((u) => <option key={u} value={u}>{unitName(value, u)}</option>)}
        </select>
        <button type="button" className={styles.settingBtn} onClick={() => setEditing(false)}>{L.notifyDone}</button>
        <button type="button" className={styles.settingBtn} onClick={() => { onChange(null, unit); setEditing(false); }}>{L.notifyOff}</button>
      </span>
    );
  }
  return (
    <button type="button" className={styles.setting} title={L.notifyTitle} onClick={() => setEditing(true)}>
      {BELL} {L.notifyBefore(value, unitName(value, unit))}
    </button>
  );
}
