import { nanoid } from 'nanoid';
import { FieldInput } from '@/components/FieldInput/FieldInput';
import { FieldError } from '@/components/FieldError/FieldError';
import { TrashIcon } from '@/components/Icons';
import { BUILT_IN_BY_KEY } from '@/config/builtInTypes';
import { FIELD_TYPE_OPTIONS } from '@/config/fieldTypes';
import { LABELS } from '@/config/labels';
import type { FieldSchema, FieldType } from '@/types';
import styles from './EndeavourCreator.module.css';

// A new Endeavour's details (the user, 2026-11-04: one line each, saying what they're for): its
// Type's fields (a subject's code) and details of its own, each a label, a value and the kind of
// value. Kept as its attributes once made (docs/features/endeavours.md "Attributes"). Its dates
// are the form's own Dates, not a detail.

const L = LABELS.endeavourCreator;
// Kinds a detail can be here; a choice list needs its choices, and dates are the form's own.
const KINDS = FIELD_TYPE_OPTIONS.filter((o) => o.value !== 'select' && o.value !== 'period');

export interface DetailsValue { typeKey?: string; fields?: FieldSchema[]; values?: Record<string, unknown> }

export function DetailsSection({ value, onChange, errors }: { value: DetailsValue; onChange: (patch: DetailsValue) => void; errors: Record<string, string> }) {
  const type = value.typeKey ? BUILT_IN_BY_KEY[value.typeKey] : undefined;
  const values = value.values ?? {};
  const own = value.fields ?? [];
  const typeFields = type?.fields.filter((f) => f.type !== 'period') ?? [];
  const setValue = (id: string, v: unknown) => onChange({ values: { ...values, [id]: v } });
  const setOwn = (i: number, next: FieldSchema | null) => onChange({ fields: next ? own.map((f, j) => (j === i ? next : f)) : own.filter((_, j) => j !== i) });

  return (
    <div className={styles.field} role="group" aria-label={L.details}>
      <span className={styles.label}>{L.details}</span>
      {typeFields.length + own.length === 0 && <p className={styles.small}>{L.detailsHint}</p>}
      {typeFields.map((f) => (
        <div key={f.id} className={styles.detailLine}>
          <span className={styles.detailFixed}>{f.name}</span>
          <span className={styles.detailValue}><FieldInput field={f} value={values[f.id] ?? null} onChange={(v) => setValue(f.id, v)} /></span>
        </div>
      ))}
      {own.map((f, i) => (
        <div key={f.id}>
          <div className={styles.detailLine} role="group" aria-label={f.name || undefined}>
            <input className={`${styles.input} ${styles.detailName}`} aria-label={L.detailName} placeholder={L.detailNamePlaceholder} value={f.name} autoFocus={!f.name}
              aria-invalid={!!errors[`field-${i}`] || undefined}
              onChange={(e) => setOwn(i, { ...f, name: e.target.value })} />
            <span className={styles.detailValue} aria-label={L.detailValue}><FieldInput field={f} value={values[f.id] ?? null} onChange={(v) => setValue(f.id, v)} /></span>
            <select className={`${styles.input} ${styles.detailKind}`} aria-label={L.detailKind} value={f.type}
              onChange={(e) => { setOwn(i, { ...f, type: e.target.value as FieldType }); setValue(f.id, null); }}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <button type="button" className={styles.iconBtn} aria-label={`${L.remove}: ${f.name || L.detailName}`} title={L.remove} onClick={() => setOwn(i, null)}>
              <TrashIcon width="1em" height="1em" />
            </button>
          </div>
          <FieldError>{errors[`field-${i}`]}</FieldError>
        </div>
      ))}
      <button type="button" className={styles.linkBtn} onClick={() => onChange({ fields: [...own, { id: nanoid(8), name: '', type: 'text' }] })}>{L.addDetail}</button>
    </div>
  );
}
