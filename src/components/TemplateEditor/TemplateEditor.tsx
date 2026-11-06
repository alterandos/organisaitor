import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { nanoid } from 'nanoid';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { IconField } from '@/components/IconPicker/IconField';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { FieldError } from '@/components/FieldError/FieldError';
import { CloseIcon, TrashIcon } from '@/components/Icons';
import { TaskRulesEditor } from '@/components/EventTaskRulesField/EventTaskRulesField';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { showToast } from '@/components/Toast/showToast';
import { isBuiltIn, saveTemplate, saveTemplateAsNew, useTemplates } from '@/services/templates';
import { FIELD_TYPE_OPTIONS } from '@/config/fieldTypes';
import { LABELS } from '@/config/labels';
import type { FieldType } from '@/types';
import type { EndeavourTemplateDef, TemplateGoalMeasure } from '@/types/templates';
import styles from './TemplateEditor.module.css';

// A template's editor (docs/features/endeavours.md "Saved templates", agreed with the user
// 2026-11-04/05): what an Endeavour made from it is (whether it ends, its dates' shape, the details
// it asks for) and what it starts with (notebooks, lists, tasks, classes with their tasks for each
// date, one-off deadlines, goals), each list, task or goal made or only suggested, and the template
// its parts start from. Structure only: labels, weekdays and weeks, never values or dates. Saving a
// built-in one keeps the person's copy (services/templates.ts).

const L = LABELS.templates;
const DAYS = [1, 2, 3, 4, 5, 6, 0];
const KINDS = FIELD_TYPE_OPTIONS.filter((o) => o.value !== 'select' && o.value !== 'period');
const newId = () => nanoid(8);

type Draft = EndeavourTemplateDef;

function errorsOf(d: Draft): Record<string, string> {
  const out: Record<string, string> = {};
  const blank = (s: string) => !s.trim();
  if (blank(d.name)) out.name = L.nameNeeded;
  for (const n of d.notebooks) if (blank(n.name)) out[n.id] = L.titleNeeded;
  for (const l of d.lists) if (blank(l.name)) out[l.id] = L.titleNeeded;
  for (const t of d.tasks) if (blank(t.title)) out[t.id] = L.titleNeeded;
  for (const c of d.classes) { if (blank(c.title)) out[c.id] = L.titleNeeded; else if (!c.weekdays.length) out[c.id] = L.daysNeeded; }
  for (const x of d.deadlines) if (blank(x.title)) out[x.id] = L.titleNeeded;
  for (const g of d.goals) if (blank(g.title)) out[g.id] = L.titleNeeded;
  d.details.forEach((f) => { if (blank(f.name)) out[`detail-${f.id}`] = LABELS.endeavourCreator.detailNeeded; });
  return out;
}

export function TemplateEditor({ def }: { def: EndeavourTemplateDef }) {
  const close = useUIStore((s) => s.closeTemplateEditor);
  const templates = useTemplates();
  const [d, setD] = useState<Draft>(() => structuredClone(def));
  const [showErrors, setShowErrors] = useState(false);
  const [original] = useState(() => JSON.stringify(def));
  const nameRef = useRef<HTMLInputElement>(null);
  const errors = errorsOf(d);
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  // One list of the draft changed by id: `patch` an entry, or null to remove it.
  function edit<K extends 'notebooks' | 'lists' | 'tasks' | 'classes' | 'deadlines' | 'goals'>(key: K, id: string, patch: Partial<Draft[K][number]> | null) {
    setD((x) => ({ ...x, [key]: patch === null ? (x[key] as { id: string }[]).filter((e) => e.id !== id) : (x[key] as { id: string }[]).map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }

  async function requestClose() {
    if (JSON.stringify(d) !== original && !(await confirmDialog({ title: L.discardTitle, message: L.discardMessage, confirmLabel: L.discard, destructive: true }))) return;
    close();
  }
  function ok(): boolean {
    if (!Object.keys(errors).length) return true;
    setShowErrors(true);
    if (errors.name) nameRef.current?.focus();
    return false;
  }

  // Save changes the template opened (a built-in one: the person's copy, with Restore default).
  function save() {
    if (!ok()) return;
    saveTemplate({ ...d, name: d.name.trim() });
    showToast({ message: L.saved(d.name.trim()) });
    close();
  }

  // Save as new leaves the one opened as it was and adds another of the person's own.
  function saveAsNew() {
    if (!ok()) return;
    const made = saveTemplateAsNew({ ...d, name: d.name.trim() }, L.copyOf);
    showToast({ message: L.saved(made.name) });
    close();
  }
  useEscapeClose(() => void requestClose());
  useCtrlEnterSubmit(() => save());

  const others = templates.filter((t) => t.id !== d.id && t.builtIn !== d.id && t.id !== d.builtIn);
  const classTitles = d.classes.map((c) => c.title).filter(Boolean);

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) void requestClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="template-editor-title">
        <div className={styles.header}>
          <h2 id="template-editor-title" className={styles.title}>{def.id ? L.editorEdit(def.name) : L.editorNew}</h2>
          <button type="button" className={styles.closeBtn} onClick={() => void requestClose()} aria-label={LABELS.endeavourCreator.close}><CloseIcon /></button>
        </div>

        <div className={styles.body}>
          {isBuiltIn(def) && <p className={styles.note}>{L.editorBuiltIn}</p>}

          <div className={styles.line}>
            <IconField value={d.icon} onChange={(icon) => set({ icon })} fallback="📁" label={L.icon} />
            <div className={styles.grow}>
              <label htmlFor="template-name" className={styles.label}>{L.name}</label>
              <input id="template-name" ref={nameRef} className={styles.input} value={d.name} placeholder={L.namePlaceholder} autoFocus
                aria-invalid={!!err('name') || undefined} onChange={(e) => set({ name: e.target.value })} />
              <FieldError>{err('name')}</FieldError>
            </div>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{L.description}</span>
            <input className={styles.input} value={d.description} placeholder={L.descriptionPlaceholder} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <p className={styles.small}>{L.placeholders}</p>

          <Section title={L.about}>
            <div className={styles.field} role="group" aria-label={LABELS.endeavourCreator.ends}>
              <span className={styles.label}>{LABELS.endeavourCreator.ends}</span>
              <div className={styles.segmented}>
                {(['project', 'list'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={d.kind === k} className={`${styles.segment} ${d.kind === k ? styles.segmentOn : ''}`} onClick={() => set({ kind: k })}>
                    {k === 'project' ? LABELS.endeavourCreator.endsProject : LABELS.endeavourCreator.endsList}
                  </button>
                ))}
              </div>
            </div>
            <label className={styles.check}><input type="checkbox" checked={d.dates.show} onChange={(e) => set({ dates: { ...d.dates, show: e.target.checked } })} /> {L.dates}</label>
            {d.dates.show && (
              <div className={styles.indent}>
                <label className={styles.check}><input type="checkbox" checked={d.dates.exams} onChange={(e) => set({ dates: { ...d.dates, exams: e.target.checked } })} /> {L.exams}</label>
                <span className={styles.label}>{L.timeOff}</span>
                {d.dates.timeOff.map((name, i) => (
                  <Row key={i} onRemove={() => set({ dates: { ...d.dates, timeOff: d.dates.timeOff.filter((_, j) => j !== i) } })}>
                    <input className={styles.input} aria-label={LABELS.period.breakLabel} placeholder={L.timeOffPlaceholder} value={name}
                      onChange={(e) => set({ dates: { ...d.dates, timeOff: d.dates.timeOff.map((x, j) => (j === i ? e.target.value : x)) } })} />
                  </Row>
                ))}
                <AddBtn onClick={() => set({ dates: { ...d.dates, timeOff: [...d.dates.timeOff, ''] } })} />
              </div>
            )}
            <span className={styles.label}>{L.details}</span>
            {d.details.map((f) => (
              <Row key={f.id} onRemove={() => set({ details: d.details.filter((x) => x.id !== f.id) })} error={err(`detail-${f.id}`)}>
                <input className={styles.input} aria-label={LABELS.endeavourCreator.detailName} placeholder={LABELS.endeavourCreator.detailNamePlaceholder} value={f.name}
                  onChange={(e) => set({ details: d.details.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)) })} />
                <select className={styles.select} aria-label={LABELS.endeavourCreator.detailKind} value={f.type}
                  onChange={(e) => set({ details: d.details.map((x) => (x.id === f.id ? { ...x, type: e.target.value as FieldType } : x)) })}>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </Row>
            ))}
            <AddBtn onClick={() => set({ details: [...d.details, { id: newId(), name: '', type: 'text' }] })} />
            <label className={styles.check}><input type="checkbox" checked={!!d.codeFromName} onChange={(e) => set({ codeFromName: e.target.checked })} /> {L.codeFromName}</label>
            <label className={styles.check}><input type="checkbox" checked={!!d.readsOutline} onChange={(e) => set({ readsOutline: e.target.checked })} /> {L.readsOutline}</label>
          </Section>

          <Section title={L.inside}>
            <Group title={L.classes} hint={L.classesHint}>
              {d.classes.map((c) => (
                <div key={c.id} className={styles.card}>
                  <Row onRemove={() => edit('classes', c.id, null)} error={err(c.id)}>
                    <input className={styles.input} aria-label={L.classTitle} placeholder={L.classTitlePlaceholder} value={c.title} onChange={(e) => edit('classes', c.id, { title: e.target.value })} />
                  </Row>
                  <div className={styles.days} role="group" aria-label={L.weekday}>
                    {DAYS.map((day) => (
                      <button key={day} type="button" aria-pressed={c.weekdays.includes(day)} className={`${styles.day} ${c.weekdays.includes(day) ? styles.dayOn : ''}`}
                        onClick={() => edit('classes', c.id, { weekdays: c.weekdays.includes(day) ? c.weekdays.filter((x) => x !== day) : [...c.weekdays, day] })}>
                        {L.dayShort[day]}
                      </button>
                    ))}
                  </div>
                  <div className={styles.line}>
                    <span className={styles.small}>{L.from}</span>
                    <TimeInput className={styles.time} value={c.start ?? ''} onChange={(v) => edit('classes', c.id, { start: v || null })} />
                    <span className={styles.small}>{L.until}</span>
                    <TimeInput className={styles.time} value={c.end ?? ''} onChange={(v) => edit('classes', c.id, { end: v || null })} />
                    <input className={`${styles.input} ${styles.grow}`} aria-label={L.place} placeholder={L.place} value={c.place ?? ''} onChange={(e) => edit('classes', c.id, { place: e.target.value || null })} />
                  </div>
                  <span className={styles.small}>{LABELS.eventTaskRules.title}</span>
                  <TaskRulesEditor rules={c.taskRules} onChange={(taskRules) => edit('classes', c.id, { taskRules })} />
                </div>
              ))}
              <AddBtn onClick={() => set({ classes: [...d.classes, { id: newId(), title: '', weekdays: [], start: null, end: null, place: null, taskRules: [] }] })} />
            </Group>

            <Group title={L.tasks}>
              {d.tasks.map((t) => (
                <Row key={t.id} onRemove={() => edit('tasks', t.id, null)} error={err(t.id)}>
                  <input className={styles.input} aria-label={L.tasks} value={t.title} onChange={(e) => edit('tasks', t.id, { title: e.target.value })} />
                  <select className={styles.select} aria-label={L.weekly} value={t.weekly ?? ''} onChange={(e) => edit('tasks', t.id, { weekly: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">{L.notWeekly}</option>
                    {DAYS.map((day) => <option key={day} value={day}>{`${L.weekly} ${L.dayNames[day]}`}</option>)}
                  </select>
                  <Suggest on={!!t.suggest} onChange={(suggest) => edit('tasks', t.id, { suggest })} />
                </Row>
              ))}
              <AddBtn onClick={() => set({ tasks: [...d.tasks, { id: newId(), title: '', kind: 'action', weekly: null }] })} />
            </Group>

            <Group title={L.deadlines} hint={L.deadlinesHint}>
              {d.deadlines.map((x) => (
                <Row key={x.id} onRemove={() => edit('deadlines', x.id, null)} error={err(x.id)}>
                  <input className={styles.input} aria-label={L.deadlines} value={x.title} onChange={(e) => edit('deadlines', x.id, { title: e.target.value })} />
                  <span className={styles.small}>{L.week}</span>
                  <input className={styles.number} type="number" min={1} max={60} aria-label={L.week} value={x.when.week}
                    onChange={(e) => edit('deadlines', x.id, { when: { ...x.when, week: Math.max(1, Math.round(Number(e.target.value) || 1)) } })} />
                  <select className={styles.select} aria-label={L.weekday} value={x.when.weekday} onChange={(e) => edit('deadlines', x.id, { when: { ...x.when, weekday: Number(e.target.value) } })}>
                    {DAYS.map((day) => <option key={day} value={day}>{L.dayNames[day]}</option>)}
                  </select>
                  <TimeInput className={styles.time} value={x.time ?? ''} onChange={(v) => edit('deadlines', x.id, { time: v || null })} />
                </Row>
              ))}
              <AddBtn onClick={() => set({ deadlines: [...d.deadlines, { id: newId(), title: '', when: { week: 1, weekday: 5 }, time: null }] })} />
            </Group>

            <Group title={L.notebooks}>
              {d.notebooks.map((n) => (
                <Row key={n.id} onRemove={() => edit('notebooks', n.id, null)} error={err(n.id)}>
                  <input className={styles.input} aria-label={L.notebooks} value={n.name} onChange={(e) => edit('notebooks', n.id, { name: e.target.value })} />
                </Row>
              ))}
              <AddBtn onClick={() => set({ notebooks: [...d.notebooks, { id: newId(), name: '{name}' }] })} />
            </Group>

            <Group title={L.lists}>
              {d.lists.map((l) => (
                <div key={l.id} className={styles.card}>
                  <Row onRemove={() => edit('lists', l.id, null)} error={err(l.id)}>
                    <input className={styles.input} aria-label={L.lists} value={l.name} onChange={(e) => edit('lists', l.id, { name: e.target.value })} />
                    <Suggest on={!!l.suggest} onChange={(suggest) => edit('lists', l.id, { suggest })} />
                  </Row>
                  <textarea className={styles.input} rows={2} aria-label={L.listItems} placeholder={L.listItems} value={l.items.join('\n')}
                    onChange={(e) => edit('lists', l.id, { items: e.target.value.split('\n') })} />
                </div>
              ))}
              <AddBtn onClick={() => set({ lists: [...d.lists, { id: newId(), name: '', items: [] }] })} />
            </Group>

            <Group title={L.goals}>
              {d.goals.map((g) => (
                <div key={g.id} className={styles.card}>
                  <Row onRemove={() => edit('goals', g.id, null)} error={err(g.id)}>
                    <input className={styles.input} aria-label={L.goals} placeholder={L.goalTitlePlaceholder} value={g.title} onChange={(e) => edit('goals', g.id, { title: e.target.value })} />
                    <Suggest on={!!g.suggest} onChange={(suggest) => edit('goals', g.id, { suggest })} />
                  </Row>
                  <div className={styles.line}>
                    <span className={styles.small}>{L.measure}</span>
                    <select className={styles.select} aria-label={L.measure} value={g.measure.kind} onChange={(e) => edit('goals', g.id, { measure: measureOf(e.target.value as TemplateGoalMeasure['kind'], classTitles[0] ?? '') })}>
                      {(['manual', 'completion', 'keepUp'] as const).map((k) => <option key={k} value={k}>{L.measures[k]}</option>)}
                    </select>
                    {g.measure.kind === 'manual' && (() => {
                      const m = g.measure;
                      return (
                        <>
                          <input className={styles.number} type="number" aria-label={L.target} placeholder={L.target} value={m.target ?? ''} onChange={(e) => edit('goals', g.id, { measure: { ...m, target: e.target.value === '' ? null : Number(e.target.value) } })} />
                          <input className={styles.unit} aria-label={L.unit} placeholder={L.unit} value={m.unit ?? ''} onChange={(e) => edit('goals', g.id, { measure: { ...m, unit: e.target.value || null } })} />
                        </>
                      );
                    })()}
                    {g.measure.kind === 'keepUp' && (() => {
                      const m = g.measure;
                      return (
                        <select className={styles.select} aria-label={L.classes} value={m.classTitle} onChange={(e) => edit('goals', g.id, { measure: { ...m, classTitle: e.target.value } })}>
                          {[...new Set([m.classTitle, ...classTitles])].filter(Boolean).map((t) => <option key={t} value={t}>{t} · {L.keepUpOf(m.count, m.outOf)}</option>)}
                        </select>
                      );
                    })()}
                  </div>
                </div>
              ))}
              <AddBtn onClick={() => set({ goals: [...d.goals, { id: newId(), title: '', measure: { kind: 'manual', unit: '%', target: null } }] })} />
            </Group>
          </Section>

          <Section title={L.parts}>
            <div className={styles.line}>
              <span className={styles.small}>{L.partsFrom}</span>
              <select className={styles.select} aria-label={L.partsFrom} value={d.partsFrom ?? ''} onChange={(e) => set({ partsFrom: e.target.value || null })}>
                <option value="">{L.partsNone}</option>
                {others.map((t) => <option key={t.id} value={t.builtIn ?? t.id}>{t.name}</option>)}
              </select>
              {d.partsFrom && (
                <>
                  <span className={styles.small}>{L.partsLabel}</span>
                  <input className={styles.unit} aria-label={L.partsLabel} placeholder={L.partsLabelPlaceholder} value={d.partsLabel ?? ''} onChange={(e) => set({ partsLabel: e.target.value || null })} />
                </>
              )}
            </div>
          </Section>
        </div>

        <div className={styles.footer}>
          {showErrors && Object.keys(errors).length > 0 && <FieldError>{LABELS.endeavourCreator.fixFirst}</FieldError>}
          <span className={styles.spacer} />
          <button type="button" className={styles.secondaryBtn} onClick={() => void requestClose()}>{L.cancel}</button>
          {def.id && <button type="button" className={styles.secondaryBtn} onClick={saveAsNew}>{L.saveAsNew}</button>}
          <button type="button" className={styles.submitBtn} onClick={save}>{L.save}</button>
        </div>
      </div>
    </div>
  );
}

function measureOf(kind: TemplateGoalMeasure['kind'], classTitle: string): TemplateGoalMeasure {
  if (kind === 'manual') return { kind, unit: '%', target: null };
  if (kind === 'completion') return { kind };
  return { kind, classTitle, count: 3, outOf: 4 };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section} aria-label={title}><h3 className={styles.sectionTitle}>{title}</h3>{children}</section>;
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.group} role="group" aria-label={title}>
      <span className={styles.label}>{title}</span>
      {hint && <p className={styles.small}>{hint}</p>}
      {children}
    </div>
  );
}

function Row({ children, onRemove, error }: { children: ReactNode; onRemove: () => void; error?: string }) {
  return (
    <div>
      <div className={styles.line}>
        {children}
        <button type="button" className={styles.iconBtn} aria-label={L.remove} title={L.remove} onClick={onRemove}><TrashIcon width="1em" height="1em" /></button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return <button type="button" className={styles.linkBtn} onClick={onClick}>{L.add}</button>;
}

function Suggest({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return <label className={styles.check} title={L.suggestHint}><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /> {L.suggest}</label>;
}
