import { useId } from 'react';
import { useCalendarStore } from '@/store/calendarStore';
import { clashingClasses } from '@/utils/classClashes';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { ClassLink, ClassLinkMode } from '@/types';
import styles from './ClassClashField.module.css';

// When an item being made or edited falls in a repeating class of its Endeavour (an in-class
// essay, a quiz in the lecture), how it shows (agreed with the user 2026-10-30): instead of the
// class that day, during it (drawn on the class), or both, as a clash. Shows nothing otherwise.
// Every form that makes a dated, timed event or Deadline for an Endeavour uses this.

const L = LABELS.classClash;

export function ClassClashField({ item, value, onChange }: {
  item: { id?: string; date: string; start: string | null; end?: string | null; collectionId: string | null };
  value: ClassLink | null | undefined;
  onChange: (link: ClassLink | null) => void;
}) {
  const events = useCalendarStore((s) => s.events);
  const name = useId();
  const clash = clashingClasses(item, events)[0];
  if (!clash) return null;
  const mode: ClassLinkMode | 'both' = value && value.eventId === clash.event.id && value.date === clash.date ? value.mode : 'both';
  const pick = (m: ClassLinkMode | 'both') => onChange(m === 'both' ? null : { eventId: clash.event.id, date: clash.date, mode: m });
  const when = `${formatDate(clash.date + 'T00:00:00')} ${clash.event.startTime ?? ''}${clash.event.endTime ? `–${clash.event.endTime}` : ''}`;
  return (
    <fieldset className={styles.field}>
      <legend className={styles.legend}>{L.question(clash.event.title, when.trim())}</legend>
      {(['replaces', 'during', 'both'] as const).map((m) => (
        <label key={m} className={styles.option}>
          <input type="radio" name={name} checked={mode === m} onChange={() => pick(m)} />
          <span>{L.modes[m]}</span>
          <span className={styles.hint}>{L.hints[m]}</span>
        </label>
      ))}
    </fieldset>
  );
}
