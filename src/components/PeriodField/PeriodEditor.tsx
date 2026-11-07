import { useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { DateInput } from '@/components/DateInput/DateInput';
import { dateRangeSuggest } from '@/utils/date';
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
  // Starts from the latest change, not this render's period: leaving a start and the end filling in
  // its suggestion happen before the next render (found 2026-11-07, the start was lost).
  const latest = useRef(period);
  useEffect(() => { latest.current = period; });
  const patch = (p: Partial<EndeavourPeriod> | ((cur: EndeavourPeriod) => Partial<EndeavourPeriod>)) => {
    const cur = latest.current;
    const next = { ...cur, ...(typeof p === 'function' ? p(cur) : p) };
    latest.current = next;
    onChange(next);
  };
  const setBreak = (id: string, p: Partial<EndeavourPeriod['breaks'][number]> | null) =>
    patch((cur) => ({ breaks: p === null ? cur.breaks.filter((b) => b.id !== id) : cur.breaks.map((b) => (b.id === id ? { ...b, ...p } : b)) }));

  return (
    <div className={styles.editor}>
      <div className={styles.line} role="group" aria-label={L.runs}>
        <span className={styles.lineLabel}>{L.runs}</span>
        <DateInput className={styles.date} value={period.start ?? ''} suggest={dateRangeSuggest.from()} aria-label={L.start} onChange={(v) => patch((cur) => ({ start: v || null, end: v && cur.end && cur.end < v ? v : cur.end }))} />
        <span className={styles.arrow} aria-hidden>→</span>
        <DateInput className={styles.date} value={period.end ?? ''} min={period.start ?? undefined} suggest={dateRangeSuggest.to(period.start)} aria-label={L.end} onChange={(v) => patch({ end: v || null })} />
      </div>
      <FieldError>{errors.dates}</FieldError>
      {(exams || period.exams) && (
        <div className={styles.line} role="group" aria-label={L.exams}>
          <span className={styles.lineLabel}>{L.exams}</span>
          <DateInput className={styles.date} value={period.exams?.from ?? ''} min={period.end ?? undefined} suggest={dateRangeSuggest.from()} aria-label={L.examsFrom}
            onChange={(v) => patch({ exams: v ? { from: v, to: period.exams?.to && period.exams.to >= v ? period.exams.to : v } : null })} />
          <span className={styles.arrow} aria-hidden>→</span>
          <DateInput className={styles.date} value={period.exams?.to ?? ''} min={period.exams?.from} suggest={dateRangeSuggest.to(period.exams?.from)} aria-label={L.examsTo}
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
            <DateInput className={styles.date} value={b.from} suggest={dateRangeSuggest.from()} aria-label={L.from} onChange={(v) => patch((cur) => ({ breaks: cur.breaks.map((x) => (x.id === b.id ? { ...x, from: v, to: x.to && x.to < v ? v : x.to } : x)) }))} />
            <span className={styles.arrow} aria-hidden>→</span>
            <DateInput className={styles.date} value={b.to} min={b.from || undefined} suggest={dateRangeSuggest.to(b.from)} aria-label={L.to} onChange={(v) => setBreak(b.id, { to: v })} />
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
