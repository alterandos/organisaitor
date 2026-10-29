import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { DateInput } from '@/components/DateInput/DateInput';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { MagicWandButton, MagicWandPanel } from '@/components/MagicWand/MagicWand';
import { CloseIcon, TrashIcon } from '@/components/Icons';
import { showToast } from '@/components/Toast/showToast';
import { ENDEAVOUR_TEMPLATES, blankRow, initialValues, type EndeavourTemplate, type TemplateColumn, type TemplateInput, type TemplateRow, type TemplateValues } from '@/config/endeavourTemplates';
import { applyTemplate, planLines } from '@/services/endeavourTemplates';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import styles from './EndeavourTemplateModal.module.css';

// Setting up an Endeavour from a template (docs/features/endeavours.md phase 6): choose one, fill
// in its form (or paste a course outline into the wand), see what it will make, make it. One Undo
// in the toast takes it all away. The form is drawn from the template's inputs, so a new template
// (config/endeavourTemplates.ts) needs nothing here.

const L = LABELS.templates;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function EndeavourTemplateModal() {
  const closeModal = useUIStore((s) => s.closeModal);
  const startPartOf = useUIStore((s) => s.templatePartOf);
  const [template, setTemplate] = useState<EndeavourTemplate | null>(null);
  useEscapeClose(closeModal);

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tpl-title">
        <div className={styles.header}>
          <span id="tpl-title" className={styles.title}>{template ? `${template.icon} ${template.label}` : L.title}</span>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={L.cancel}><CloseIcon /></button>
        </div>
        {template
          ? <TemplateForm key={template.id} template={template} startPartOf={startPartOf} onBack={() => setTemplate(null)} />
          : (
            <div className={styles.body}>
              <p className={styles.hint}>{L.choose}</p>
              <div className={styles.choices}>
                {ENDEAVOUR_TEMPLATES.map((t) => (
                  <button key={t.id} type="button" className={styles.choice} onClick={() => setTemplate(t)}>
                    <span className={styles.choiceTitle}>{t.icon} {t.label}</span>
                    <span className={styles.hint}>{t.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

function TemplateForm({ template, startPartOf, onBack }: { template: EndeavourTemplate; startPartOf: CollectionId | null; onBack: () => void }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const collections = useTaskStore((s) => s.collections);
  const [values, setValues] = useState<TemplateValues>(() => initialValues(template));
  const [partOf, setPartOf] = useState<CollectionId | null>(startPartOf);
  const [wand, setWand] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  const plan = useMemo(() => template.plan(values), [template, values]);
  const set = (id: string, v: unknown) => setValues((prev) => ({ ...prev, [id]: v }));
  const endeavours = Object.values(collections).filter((c) => (c.kind === 'project' || c.kind === 'list') && !c.archivedAt);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const { id, made, undo } = applyTemplate(plan, partOf);
    closeModal();
    useUIStore.getState().openEndeavourHome(id);
    showToast({ message: L.made(plan.endeavour.name, made), actions: [{ label: L.undo, onClick: undo }] });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.body}>
        {template.wand && (
          <div className={styles.wandRow}>
            <MagicWandButton open={wand} onToggle={() => setWand((w) => !w)} />
            <span className={styles.hint}>{template.wand.hint}</span>
          </div>
        )}
        {wand && template.wand && (
          <MagicWandPanel
            hint={template.wand.hint}
            onRead={(text) => { const read = template.wand!.read(text, values); if (read) setValues((prev) => ({ ...prev, ...read })); return !!read; }}
            onClose={() => setWand(false)}
          />
        )}

        <div className={styles.grid}>
          {template.inputs.map((input) => <Field key={input.id} input={input} value={values[input.id]} values={values} onChange={(v) => set(input.id, v)} />)}
          <div className={styles.field}>
            <span className={styles.label}>{L.partOf}</span>
            <CollectionPicker collections={endeavours} value={partOf} onChange={setPartOf} noneLabel={`— ${LABELS.collection} —`} />
          </div>
        </div>

        <section className={styles.preview} aria-label={L.willMake}>
          <h3 className={styles.label}>{L.willMake}</h3>
          <ul className={styles.previewList}>{planLines(plan).map((line, i) => <li key={i}>{line}</li>)}</ul>
        </section>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.secondaryBtn} onClick={onBack}>{L.back}</button>
        <span className={styles.spacer} />
        <button type="button" className={styles.secondaryBtn} onClick={closeModal}>{L.cancel}</button>
        <button type="submit" className={styles.submitBtn}>{L.make}</button>
      </div>
    </form>
  );
}

function Field({ input, value, values, onChange }: { input: TemplateInput; value: unknown; values: TemplateValues; onChange: (v: unknown) => void }) {
  const str = typeof value === 'string' ? value : '';
  if (input.kind === 'checkbox') {
    return (
      <label className={`${styles.check} ${styles.wide}`}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {input.label}
      </label>
    );
  }
  if (input.kind === 'rows') return <RowsField input={input} rows={(value as TemplateRow[] | undefined) ?? []} values={values} onChange={onChange} />;
  if (input.kind === 'days') {
    const days = (value as number[] | undefined) ?? [];
    return (
      <div className={styles.field} role="group" aria-label={input.label}>
        <span className={styles.label}>{input.label}</span>
        <div className={styles.days}>
          {WEEK_ORDER.map((d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} className={`${styles.day} ${days.includes(d) ? styles.dayOn : ''}`}
              onClick={() => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b))}>
              {DAY_NAMES[d]}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <label className={`${styles.field} ${input.kind === 'lines' ? styles.wide : ''}`}>
      <span className={styles.label}>{input.label}</span>
      {input.kind === 'date' ? <DateInput className={styles.input} value={str} onChange={onChange} aria-label={input.label} />
        : input.kind === 'time' ? <TimeInput className={styles.input} value={str} onChange={onChange} placeholder={input.label} />
        : input.kind === 'weekday' ? (
          <select className={styles.input} value={typeof value === 'number' ? value : -1} onChange={(e) => onChange(Number(e.target.value))}>
            <option value={-1}>—</option>
            {WEEK_ORDER.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
          </select>
        )
        : input.kind === 'number' ? <input className={styles.input} type="number" value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
        : input.kind === 'lines' ? <textarea className={styles.input} rows={4} value={str} placeholder={input.placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input className={styles.input} value={str} placeholder={input.placeholder} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

// A list the person adds rows to (a repeating group): each row its own details, fields shown
// only when they apply to that row (a weekday for a weekly task, "from" for a dated-after task).
function RowsField({ input, rows, values, onChange }: { input: TemplateInput; rows: TemplateRow[]; values: TemplateValues; onChange: (v: unknown) => void }) {
  const patch = (id: string, field: string, v: unknown) => onChange(rows.map((r) => (r._id === id ? { ...r, [field]: v } : r)));
  return (
    <section className={`${styles.rowsField} ${styles.wide}`} aria-label={input.label}>
      <h3 className={styles.label}>{input.label}</h3>
      {input.hint && <p className={styles.hint}>{input.hint}</p>}
      {rows.map((row, i) => (
        <div key={row._id} className={styles.row} role="group" aria-label={`${input.label} ${i + 1}`}>
          {(input.columns ?? []).filter((c) => !c.showIf || c.showIf(row)).map((c) => (
            <Cell key={c.id} column={c} value={row[c.id]} values={values} onChange={(v) => patch(row._id, c.id, v)} />
          ))}
          <button type="button" className={styles.iconBtn} aria-label={`${L.removeRow}: ${input.label} ${i + 1}`} title={L.removeRow} onClick={() => onChange(rows.filter((r) => r._id !== row._id))}>
            <TrashIcon width="1em" height="1em" />
          </button>
        </div>
      ))}
      <button type="button" className={styles.addBtn} onClick={() => onChange([...rows, blankRow(input)])}>{input.addLabel ?? L.addRow}</button>
    </section>
  );
}

function Cell({ column: c, value, values, onChange }: { column: TemplateColumn; value: unknown; values: TemplateValues; onChange: (v: unknown) => void }) {
  const str = typeof value === 'string' ? value : '';
  const options = typeof c.options === 'function' ? c.options(values) : c.options ?? [];
  const control =
    c.kind === 'date' ? <DateInput className={styles.input} value={str} onChange={onChange} aria-label={c.label} />
    : c.kind === 'time' ? <TimeInput className={styles.input} value={str} onChange={onChange} placeholder={c.label} />
    : c.kind === 'weekday' ? (
      <select className={styles.input} aria-label={c.label} value={typeof value === 'number' ? value : -1} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={-1}>—</option>
        {WEEK_ORDER.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
      </select>
    )
    : c.kind === 'select' ? (
      <select className={styles.input} aria-label={c.label} value={str} onChange={(e) => onChange(e.target.value)}>
        {!options.some((o) => o.value === str) && <option value={str}>{str || '—'}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
    : c.kind === 'number' ? <input className={`${styles.input} ${styles.cellNumber}`} type="number" aria-label={c.label} value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    : <input className={styles.input} aria-label={c.label} placeholder={c.placeholder} value={str} onChange={(e) => onChange(e.target.value)} />;
  return (
    <div className={styles.cell}>
      <span className={styles.cellLabel} aria-hidden>{c.label}</span>
      {control}
    </div>
  );
}
