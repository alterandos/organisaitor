import { useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { DateInput } from '@/components/DateInput/DateInput';
import { FieldError } from '@/components/FieldError/FieldError';
import { TrashIcon } from '@/components/Icons';
import { dateRangeSuggest, formatDate } from '@/utils/date';
import { periodFromUse, rangeOf, type NamedPeriod } from '@/utils/datePeriods';
import { LABELS } from '@/config/labels';
import type { DateUse, FieldSchema } from '@/types';
import styles from './PeriodsField.module.css';

// THE editor of named periods and what uses them (CLAUDE.md "Named periods", agreed with the user
// 2026-11-07): one line per period, its name and dates (its own, editable; those from above, greyed
// and saying where from), and what it does here: Runs during, Pauses during, or Not used. A period
// is neither on nor off; the choice is the user's. With no choice of its own it shows the one it
// takes from above, and changing any line makes it its own ("Take …'s instead" goes back).
// `fields` / `values` are its own details: only the date-range ones are touched here. A Schedule
// uses it to choose (`editable` off: no periods of its own).

const L = LABELS.periods;
type Role = 'runs' | 'pauses' | '';
const EMPTY_USE: DateUse = { runs: [], pauses: [] };
const day = (iso: string | null) => (iso ? formatDate(`${iso}T00:00:00`) : '…');

interface Props {
  fields?:    FieldSchema[];
  values?:    Record<string, unknown>;
  onFields?:  (fields: FieldSchema[], values: Record<string, unknown>) => void;
  inherited:  readonly NamedPeriod[];
  use:        DateUse | null;               // its own; null = as above
  above:      { use: DateUse; name: string } | null;
  onUse:      (use: DateUse | null) => void;
  fromName:   (endeavourId: string) => string;
  errors?:    Record<string, string>;
  editable?:  boolean;
}

export function PeriodsField({ fields = [], values = {}, onFields, inherited, use, above, onUse, fromName, errors = {}, editable = true }: Props) {
  const own = fields.filter((f) => f.type === 'dateRange');
  const ownPeriods: NamedPeriod[] = own.map((f) => ({ id: f.id, name: f.name, ...rangeOf(values[f.id]), endeavourId: '' }));
  const all = [...ownPeriods, ...inherited.filter((p) => !own.some((f) => f.id === p.id))];
  const shown = use ?? above?.use ?? EMPTY_USE;
  const roleOf = (id: string): Role => (shown.runs.includes(id) ? 'runs' : shown.pauses.includes(id) ? 'pauses' : '');
  const resolved = periodFromUse(shown, all);

  function setRole(id: string, role: Role) {
    const runs = shown.runs.filter((x) => x !== id);
    const pauses = shown.pauses.filter((x) => x !== id);
    onUse({ runs: role === 'runs' ? [...runs, id] : runs, pauses: role === 'pauses' ? [...pauses, id] : pauses });
  }
  // The latest fields and values, changed at once: leaving a "from" (which saves it) and entering the
  // "to" (which fills in its suggestion and saves it) happen in one go, before the next render, so
  // each must start from the other's change, not from what this render was given (found 2026-11-07:
  // the start date was lost).
  const latest = useRef({ fields, values });
  useEffect(() => { latest.current = { fields, values }; });
  const commit = (f: FieldSchema[], v: Record<string, unknown>) => { latest.current = { fields: f, values: v }; onFields?.(f, v); };
  const setField = (id: string, patch: Partial<FieldSchema>) => commit(latest.current.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)), latest.current.values);
  function setRange(id: string, side: 'from' | 'to', v: string) {
    const cur = rangeOf(latest.current.values[id]);
    const next = side === 'from' ? { from: v, to: cur.to && v && cur.to < v ? v : cur.to } : { from: cur.from, to: v && cur.from && v < cur.from ? cur.from : v };
    commit(latest.current.fields, { ...latest.current.values, [id]: next });
  }
  function add() {
    const id = nanoid(8);
    commit([...latest.current.fields, { id, name: '', type: 'dateRange' }], { ...latest.current.values, [id]: { from: '', to: '' } });
    onUse({ runs: shown.runs.length ? shown.runs : [id], pauses: shown.runs.length ? [...shown.pauses, id] : shown.pauses });
  }
  function remove(id: string) {
    const rest = { ...latest.current.values };
    delete rest[id];
    commit(latest.current.fields.filter((f) => f.id !== id), rest);
    if (use) onUse({ runs: use.runs.filter((x) => x !== id), pauses: use.pauses.filter((x) => x !== id) });
  }

  const roleSelect = (p: NamedPeriod) => (
    <select className={styles.role} aria-label={`${L.role}: ${p.name || L.name}`} value={roleOf(p.id)} onChange={(e) => setRole(p.id, e.target.value as Role)}>
      <option value="runs">{L.runs}</option>
      <option value="pauses">{L.pauses}</option>
      <option value="">{L.none}</option>
    </select>
  );

  return (
    <div className={styles.field}>
      {resolved && (resolved.start || resolved.end) && (
        <p className={styles.summary}>
          {L.summary(day(resolved.start), day(resolved.end))}
          {!use && above && <span className={styles.from}> · {L.asEndeavour(above.name)}</span>}
        </p>
      )}
      {all.length === 0 && <p className={styles.hint}>{L.nothing}</p>}
      {ownPeriods.map((p) => (
        <div key={p.id}>
          <div className={styles.line} role="group" aria-label={p.name || L.name}>
            {roleSelect(p)}
            <input className={styles.name} aria-label={L.name} placeholder={L.namePlaceholder} value={p.name} autoFocus={!p.name}
              aria-invalid={!!errors[`period-${p.id}`] || undefined}
              onChange={(e) => setField(p.id, { name: e.target.value })} />
            <DateInput className={styles.date} value={p.from} suggest={dateRangeSuggest.from()} aria-label={`${L.from}: ${p.name}`}
              onChange={(v) => setRange(p.id, 'from', v)} />
            <span className={styles.arrow} aria-hidden>→</span>
            <DateInput className={styles.date} value={p.to} min={p.from || undefined} suggest={dateRangeSuggest.to(p.from)} aria-label={`${L.to}: ${p.name}`}
              onChange={(v) => setRange(p.id, 'to', v)} />
            <button type="button" className={styles.iconBtn} aria-label={`${L.remove}: ${p.name || L.name}`} title={L.remove} onClick={() => remove(p.id)}>
              <TrashIcon width="1em" height="1em" />
            </button>
          </div>
          <FieldError>{errors[`period-${p.id}`]}</FieldError>
        </div>
      ))}
      {inherited.filter((p) => !own.some((f) => f.id === p.id)).map((p) => (
        <div key={`up-${p.id}`} className={`${styles.line} ${styles.inherited}`} role="group" aria-label={p.name}>
          {roleSelect(p)}
          <span className={styles.inheritedName}>{p.name}</span>
          <span>{p.from || p.to ? `${day(p.from || null)} – ${day(p.to || null)}` : L.noDates}</span>
          <span className={styles.from}>{L.fromAbove(fromName(p.endeavourId))}</span>
        </div>
      ))}
      <div className={styles.actions}>
        {editable && <button type="button" className={styles.linkBtn} onClick={add}>{L.add}</button>}
        {use && above && <button type="button" className={styles.linkBtn} onClick={() => onUse(null)}>{L.takeAbove(above.name)}</button>}
      </div>
    </div>
  );
}
