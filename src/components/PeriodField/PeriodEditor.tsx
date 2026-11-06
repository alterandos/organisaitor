import { nanoid } from 'nanoid';
import { DateInput } from '@/components/DateInput/DateInput';
import { FieldError } from '@/components/FieldError/FieldError';
import { TrashIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { EndeavourPeriod } from '@/types';
import styles from './PeriodField.module.css';

// THE editor of an Endeavour's dates (CLAUDE.md "One period editor"): when it runs, its time off
// (breaks, which anything repeating in it skips) and, where asked for, its exam period. It holds no
// state: the creator keeps the value until the Endeavour is made, PeriodField writes it at once.
// `errors`: red notes keyed `break-<i>`.

const L = LABELS.period;

interface Props {
  period:   EndeavourPeriod;
  onChange: (next: EndeavourPeriod) => void;
  exams?:   boolean;
  errors?:  Record<string, string>;
}

export function PeriodEditor({ period, onChange, exams, errors = {} }: Props) {
  const patch = (p: Partial<EndeavourPeriod>) => onChange({ ...period, ...p });
  const setBreak = (id: string, p: Partial<EndeavourPeriod['breaks'][number]> | null) =>
    patch({ breaks: p === null ? period.breaks.filter((b) => b.id !== id) : period.breaks.map((b) => (b.id === id ? { ...b, ...p } : b)) });

  return (
    <div className={styles.editor}>
      <div className={styles.line} role="group" aria-label={L.runs}>
        <span className={styles.lineLabel}>{L.runs}</span>
        <DateInput className={styles.date} value={period.start ?? ''} aria-label={L.start} onChange={(v) => patch({ start: v || null })} />
        <span className={styles.arrow} aria-hidden>→</span>
        <DateInput className={styles.date} value={period.end ?? ''} min={period.start ?? undefined} aria-label={L.end} onChange={(v) => patch({ end: v || null })} />
      </div>
      {(exams || period.exams) && (
        <div className={styles.line} role="group" aria-label={L.exams}>
          <span className={styles.lineLabel}>{L.exams}</span>
          <DateInput className={styles.date} value={period.exams?.from ?? ''} min={period.end ?? undefined} aria-label={L.examsFrom}
            onChange={(v) => patch({ exams: v ? { from: v, to: period.exams?.to && period.exams.to >= v ? period.exams.to : v } : null })} />
          <span className={styles.arrow} aria-hidden>→</span>
          <DateInput className={styles.date} value={period.exams?.to ?? ''} min={period.exams?.from} aria-label={L.examsTo}
            onChange={(v) => { if (period.exams && v) patch({ exams: { ...period.exams, to: v } }); }} />
        </div>
      )}
      {period.breaks.length > 0 && <span className={styles.lineLabel}>{L.breaks}</span>}
      {period.breaks.map((b, i) => (
        <div key={b.id}>
          <div className={styles.line} role="group" aria-label={b.label || undefined}>
            <input className={styles.input} aria-label={L.breakLabel} placeholder={L.breakPlaceholder} value={b.label} autoFocus={!b.label}
              aria-invalid={!!errors[`break-${i}`] || undefined}
              onChange={(e) => setBreak(b.id, { label: e.target.value })} />
            <DateInput className={styles.date} value={b.from} aria-label={L.from} onChange={(v) => setBreak(b.id, { from: v, to: b.to && b.to >= v ? b.to : v })} />
            <span className={styles.arrow} aria-hidden>→</span>
            <DateInput className={styles.date} value={b.to} min={b.from || undefined} aria-label={L.to} onChange={(v) => setBreak(b.id, { to: v })} />
            <button type="button" className={styles.iconBtn} aria-label={`${L.removeBreak}: ${b.label || L.breakLabel}`} title={L.removeBreak} onClick={() => setBreak(b.id, null)}>
              <TrashIcon width="1em" height="1em" />
            </button>
          </div>
          <FieldError>{errors[`break-${i}`]}</FieldError>
        </div>
      ))}
      <div className={styles.actions}>
        <button type="button" className={styles.linkBtn} onClick={() => patch({ breaks: [...period.breaks, { id: nanoid(8), label: '', from: '', to: '' }] })}>{L.addBreak}</button>
        <span className={styles.hint}>{L.breaksHint}</span>
      </div>
    </div>
  );
}
