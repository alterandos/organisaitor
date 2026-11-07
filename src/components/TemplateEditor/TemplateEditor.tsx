import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { nanoid } from 'nanoid';
import { TagField } from '@/components/TagField/TagField';
import { tagByName, tagLabel } from '@/services/tags';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { IconField } from '@/components/IconPicker/IconField';
import { FieldError } from '@/components/FieldError/FieldError';
import { CloseIcon, TrashIcon } from '@/components/Icons';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { showToast } from '@/components/Toast/showToast';
import { isBuiltIn, saveTemplate, saveTemplateAsNew, useTemplates } from '@/services/templates';
import { FIELD_TYPE_OPTIONS } from '@/config/fieldTypes';
import { LABELS } from '@/config/labels';
import type { FieldType } from '@/types';
import type { EndeavourTemplateDef } from '@/types/templates';
import styles from './TemplateEditor.module.css';

// A template's editor (docs/features/endeavours.md "Saved templates", agreed with the user
// 2026-11-04/05, cut down to the form 2026-11-06): what an Endeavour made from it is (whether it
// ends, its dates' shape, the details it asks for), its tags and whether it makes a notebook, and the
// template its parts start from. Nothing else: what's in an Endeavour is added on its home. Structure
// only, never values or dates. Saving a built-in one keeps the person's copy (services/templates.ts).

const L = LABELS.templates;
const KINDS = FIELD_TYPE_OPTIONS.filter((o) => o.value !== 'select' && o.value !== 'period');
const newId = () => nanoid(8);

type Draft = EndeavourTemplateDef;

function errorsOf(d: Draft): Record<string, string> {
  const out: Record<string, string> = {};
  const blank = (s: string) => !s.trim();
  if (blank(d.name)) out.name = L.nameNeeded;
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
  // A template keeps its tags by name (they're made on Create); the field works in tags, so those
  // that don't exist yet are drafts only while it's open (services/tags.ts).
  const [tagIds, setTagIdsState] = useState<string[]>(() => def.tags.map(tagByName));
  const setTagIds = (ids: string[]) => { setTagIdsState(ids); set({ tags: ids.map(tagLabel).filter(Boolean) }); };

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

          <Section title={L.about}>
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
            <p className={styles.small}>{L.insideHint}</p>
            <TagField value={tagIds} onChange={setTagIds} label={L.tags} hint={L.tagsHint} labelClassName={styles.label} />
            <label className={styles.check}><input type="checkbox" checked={d.notebook} onChange={(e) => set({ notebook: e.target.checked })} /> {L.notebook}</label>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section} aria-label={title}><h3 className={styles.sectionTitle}>{title}</h3>{children}</section>;
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

