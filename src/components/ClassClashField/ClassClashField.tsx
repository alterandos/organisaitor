import { useId, useState } from 'react';
import { useCalendarStore } from '@/store/calendarStore';
import { clashingClasses, type ClashItem } from '@/utils/classClashes';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { ClassLink, ClassLinkMode } from '@/types';
import styles from './ClassClashField.module.css';

// When an item being made or edited falls in the time of another confirmed, timed event (any
// Endeavour; widened 2026-11-07 from its own Endeavour's classes), how it shows (agreed with the user
// 2026-10-30): instead of that event on those dates (only when it repeats), during it (drawn on it),
// or both, as a clash. A repeating item is asked once for all its dates that fall in it. Tentative
// items, on either side, never ask. Shows nothing otherwise. Every form that makes a dated, timed
// event or Deadline uses this (CalendarItemFields).

const L = LABELS.classClash;

export function ClassClashField({ item, value, onChange }: {
  item: ClashItem;
  value: ClassLink | null | undefined;
  onChange: (link: ClassLink | null) => void;
}) {
  const events = useCalendarStore((s) => s.events);
  const name = useId();
  const questionId = useId();
  const clashes = clashingClasses(item, events);
  // Clashing with several: the one answered for (2026-11-07), the linked one first.
  const [picked, setPicked] = useState<string | null>(value?.eventId ?? null);
  const clash = clashes.find((c) => c.event.id === picked) ?? clashes[0];
  if (!clash) return null;
  const series = !!item.repeat;
  const date = series ? null : clash.dates[0];
  const mine = !!value && value.eventId === clash.event.id && (series ? !value.date : value.date === date);
  const mode: ClassLinkMode | 'both' = mine ? value!.mode : 'both';
  const pick = (m: ClassLinkMode | 'both') => onChange(m === 'both' ? null : { eventId: clash.event.id, ...(date ? { date } : {}), mode: m });
  const time = `${clash.event.startTime ?? ''}${clash.event.endTime ? `–${clash.event.endTime}` : ''}`;
  const question = clash.dates.length > 1 || series
    ? L.questionMany(clash.dates.length, clash.event.title, time)
    : L.question(clash.event.title, `${formatDate(clash.dates[0] + 'T00:00:00')} ${time}`.trim());
  // Only a repeating event has dates to give up; a one-off can't be shown "instead of".
  const modes = (clash.event.repeat ? ['replaces', 'during', 'both'] : ['during', 'both']) as (ClassLinkMode | 'both')[];
  return (
    // A group, not a fieldset: a legend sits on the fieldset's border, so its shading started half-way
    // down the question (2026-11-07).
    <div role="radiogroup" aria-labelledby={questionId} className={styles.field}>
      {clashes.length > 1 && (
        <label className={styles.which}>
          <span>{L.which(clashes.length)}</span>
          <select value={clash.event.id} onChange={(e) => { setPicked(e.target.value); onChange(null); }}>
            {clashes.map((c) => <option key={c.event.id} value={c.event.id}>{c.event.title} ({c.event.startTime}{c.event.endTime ? `–${c.event.endTime}` : ''})</option>)}
          </select>
        </label>
      )}
      <span id={questionId} className={styles.legend}>{question}</span>
      {modes.map((m) => (
        <label key={m} className={styles.option}>
          <input type="radio" name={name} checked={mode === m} onChange={() => pick(m)} />
          <span>{L.modes[m]}</span>
          <span className={styles.hint}>{L.hints[m]}</span>
        </label>
      ))}
    </div>
  );
}
