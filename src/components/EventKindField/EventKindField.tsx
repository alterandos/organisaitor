import { LABELS } from '@/config/labels';
import { EVENT_KINDS, birthdayAge, type EventKind } from '@/config/calendarEventTypes';
import type { CalendarEventType } from '@/types';
import styles from './EventKindField.module.css';

type Kind = EventKind['value'];

// What kind of event (config/calendarEventTypes.ts): Birthday and Travel as switches (2026-11-06, the
// user: no "Event" chip; neither on is an ordinary event, 'default'), then the kind's
// own field: a birthday's year born (its first date's year, so the calendar can show the age). A
// journey just takes ✈️ (2026-11-06: a row of modes to pick was more than wanted; one imported with
// a mode still shows its own). In the shared calendar item form (components/CalendarItemForm).
export function EventKindField({ kind, onKind, date, onDate, today }: {
  kind: CalendarEventType; onKind: (k: Kind) => void;
  date: string; onDate: (d: string) => void; today: string;
}) {
  const L = LABELS.calendarForm;
  const year = date.slice(0, 4);
  const age = kind === 'birthday' && date ? birthdayAge(date, today) : null;
  return (
    <div className={styles.wrap}>
      <div className={styles.chips} role="group" aria-label={L.kinds}>
        {EVENT_KINDS.filter((k) => k.value !== 'default').map((k) => (
          <button key={k.value} type="button" aria-pressed={kind === k.value}
            className={`${styles.chip} ${kind === k.value ? styles.on : ''}`} onClick={() => onKind(kind === k.value ? 'default' : k.value)}>
            <span aria-hidden="true">{k.icon}</span>{k.label}
          </button>
        ))}
      </div>
      {kind === 'birthday' && (
        <label className={styles.year} title={L.yearBornHint}>
          {L.yearBorn}
          <input type="text" inputMode="numeric" maxLength={4} className={styles.yearInput} defaultValue={year} key={year}
            onBlur={(e) => { const y = e.target.value.trim(); if (/^\d{4}$/.test(y) && y !== year && date) onDate(`${y}${date.slice(4)}`); }} />
          {age !== null && <span className={styles.age}>{L.turns(age)}</span>}
        </label>
      )}
    </div>
  );
}
