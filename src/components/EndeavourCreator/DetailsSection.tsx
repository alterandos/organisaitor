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
const KINDS = FIELD_TYPE_OPTIONS.filter((o) => o.value !== 'select' && o.value !== 'period' && o.value !== 'dateRange');

export interface DetailsValue { typeKey?: string; fields?: FieldSchema[]; values?: Record<string, unknown> }

// `fallback`: a value worked out elsewhere (a subject's code, from its name), shown until one is typed.
export function DetailsSection({ value, onChange, errors, fallback }: { value: DetailsValue; onChange: (patch: DetailsValue) => void; errors: Record<string, string>; fallback?: Record<string, unknown> }) {
  const type = value.typeKey ? BUILT_IN_BY_KEY[value.typeKey] : undefined;
  const values = value.values ?? {};
  // Named periods are details too, edited in the form's Dates (components/PeriodsField).
  const all = value.fields ?? [];
  const own = all.filter((f) => f.type !== 'dateRange');
  const typeFields = type?.fields.filter((f) => f.type !== 'period') ?? [];
  const setValue = (id: string, v: unknown) => onChange({ values: { ...values, [id]: v } });
  const setOwn = (id: string, next: FieldSchema | null) => onChange({ fields: next ? all.map((f) => (f.id === id ? next : f)) : all.filter((f) => f.id !== id) });

  return (
    <div className={styles.field} role="group" aria-label={L.details}>
      <span className={styles.label} title={L.detailsHint}>{L.details} <span className={styles.hintMark} aria-hidden>?</span></span>
      <span className={styles.visuallyHidden}>{L.detailsHint}</span>
      {typeFields.length + own.length === 0 && <p className={styles.small}>{L.detailsEmpty}</p>}
      {own.length > 0 && (
        <div className={`${styles.detailLine} ${styles.detailHead}`} aria-hidden>
          <span className={styles.detailName}>{L.detailNameHead}</span>
          <span className={styles.detailValue}>{L.detailValueHead}</span>
          <span className={styles.detailKind}>{L.detailKindHead}</span>
          <span className={styles.detailGap} />
        </div>
      )}
      {typeFields.map((f) => (
        <div key={f.id} className={styles.detailLine}>
          <span className={styles.detailFixed}>{f.name}</span>
          <span className={styles.detailValue}><FieldInput field={f} value={values[f.id] ?? fallback?.[f.id] ?? null} onChange={(v) => setValue(f.id, v)} /></span>
        </div>
      ))}
      {own.map((f) => (
        <div key={f.id}>
          <div className={styles.detailLine} role="group" aria-label={f.name || undefined}>
            <input className={`${styles.input} ${styles.detailName}`} aria-label={L.detailName} placeholder={L.detailNamePlaceholder} value={f.name} autoFocus={!f.name}
              aria-invalid={!!errors[`field-${f.id}`] || undefined}
              onChange={(e) => setOwn(f.id, { ...f, name: e.target.value })} />
            <span className={styles.detailValue} aria-label={L.detailValue}><FieldInput field={f} value={values[f.id] ?? fallback?.[f.id] ?? null} onChange={(v) => setValue(f.id, v)} /></span>
            <select className={`${styles.input} ${styles.detailKind}`} aria-label={L.detailKind} value={f.type}
              onChange={(e) => { setOwn(f.id, { ...f, type: e.target.value as FieldType }); setValue(f.id, null); }}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <button type="button" className={styles.iconBtn} aria-label={`${L.remove}: ${f.name || L.detailName}`} title={L.remove} onClick={() => setOwn(f.id, null)}>
              <TrashIcon width="1em" height="1em" />
            </button>
          </div>
          <FieldError>{errors[`field-${f.id}`]}</FieldError>
        </div>
      ))}
      <button type="button" className={styles.linkBtn} onClick={() => onChange({ fields: [...all, { id: nanoid(8), name: '', type: 'text' }] })}>{L.addDetail}</button>
    </div>
  );
}
