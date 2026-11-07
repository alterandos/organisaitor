import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { TagField } from '@/components/TagField/TagField';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { CloseIcon, EditIcon, TrashIcon } from '@/components/Icons';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { useTaskStore } from '@/store/taskStore';
import { tagsFromParents } from '@/utils/tagScope';
import { LABELS } from '@/config/labels';
import { FIELD_TYPE_OPTIONS } from '@/config/fieldTypes';
import { TRACKER_TEMPLATES } from '@/config/trackerTemplates';
import type { CollectionId, FieldSchema, FieldType, PurposeId, RoutineTask, TagId, TrackerTemplate } from '@/types';
import styles from './RecordFields.module.css';

// THE fields of a tracker and a routine, for a new one and an existing one alike (adopted
// 2026-11-07, "Creating and editing a thing is one form": the new-tracker form couldn't change its
// fields and the edit pane couldn't start from a template; the new-routine form hid most fields
// under "Advanced" and couldn't reorder steps). The hosts (AddTrackerModal / EditTrackerPane,
// AddRoutineModal / EditRoutinePane) hold the values and save them.

const L = LABELS.recordFields;

export interface RecordCommon {
  name:         string;
  color:        string | null;
  collectionId: CollectionId | null;
  purposeIds:   PurposeId[];
  tagIds:       TagId[];
}

// What a tracker and a routine share: name, colour, Endeavour, Purposes, tags.
export function RecordCommonFields({ value, onChange, nameId, namePlaceholder, autoFocus = false }: {
  value: RecordCommon; onChange: (patch: Partial<RecordCommon>) => void; nameId: string; namePlaceholder: string; autoFocus?: boolean;
}) {
  const collections = useTaskStore((s) => s.collections);
  const purposes = useTaskStore((s) => s.purposes);
  const purposeList = Object.values(purposes).filter((p) => !p.archivedAt);
  const allCollections = Object.values(collections);
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={nameId}>{L.name}</label>
        <input id={nameId} className={styles.input} type="text" value={value.name} placeholder={namePlaceholder} autoFocus={autoFocus}
          onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{L.colour}</span>
        <ColorPicker palette="standard" value={value.color} onChange={(color) => onChange({ color })} />
      </div>
      {allCollections.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>{LABELS.collection}</span>
          <CollectionPicker collections={allCollections} value={value.collectionId} onChange={(collectionId) => onChange({ collectionId })} noneLabel={`No ${LABELS.collection}`} />
        </div>
      )}
      {purposeList.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>{L.purposes}</span>
          <div className={styles.chips}>
            {purposeList.map((p) => {
              const on = value.purposeIds.includes(p.id as PurposeId);
              return (
                <button key={p.id} type="button" aria-pressed={on} className={`${styles.chip} ${on ? styles.chipActive : ''}`}
                  style={p.color ? { '--chip-color': p.color } as React.CSSProperties : undefined}
                  onClick={() => onChange({ purposeIds: on ? value.purposeIds.filter((x) => x !== p.id) : [...value.purposeIds, p.id as PurposeId] })}>
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className={styles.field}>
        <TagField value={value.tagIds} onChange={(ids) => onChange({ tagIds: ids as TagId[] })} labelClassName={styles.label}
          inherited={value.collectionId ? tagsFromParents([value.collectionId], collections) : []}
          fromName={(id) => collections[id as CollectionId]?.name ?? ''} />
      </div>
    </>
  );
}

// ── A routine: its steps and the days it repeats on ─────────────────────────

const WEEKDAYS = [1, 2, 3, 4, 5];

export function RoutineFields({ steps, onSteps, daysOfWeek, onDays }: {
  steps: RoutineTask[]; onSteps: (next: RoutineTask[]) => void; daysOfWeek: number[]; onDays: (next: number[]) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const newRef = useRef<HTMLInputElement>(null);
  const renumber = (list: RoutineTask[]) => list.map((t, i) => ({ ...t, order: i }));
  const add = () => {
    const title = newTitle.trim();
    if (!title) return;
    onSteps(renumber([...steps, { id: nanoid(8), title, order: steps.length }]));
    setNewTitle('');
    newRef.current?.focus();
  };
  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= steps.length) return;
    const arr = [...steps];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    onSteps(renumber(arr));
  };
  const everyDay = daysOfWeek.length === 0;
  const isWeekdays = daysOfWeek.length === 5 && WEEKDAYS.every((d) => daysOfWeek.includes(d));
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.label}>{L.steps}</span>
          <span className={styles.meta}>{L.stepCount(steps.length)}</span>
        </div>
        {steps.length === 0 && <p className={styles.empty}>{L.noSteps}</p>}
        {steps.map((t, idx) => (
          <div key={t.id} className={styles.row}>
            <input className={styles.rowInput} value={t.title} aria-label={L.stepTitle}
              onChange={(e) => onSteps(steps.map((x) => (x.id === t.id ? { ...x, title: e.target.value } : x)))} />
            <div className={styles.rowActions}>
              <button type="button" className={styles.actionBtn} onClick={() => move(idx, -1)} disabled={idx === 0} title={L.moveUp} aria-label={L.moveUp}>↑</button>
              <button type="button" className={styles.actionBtn} onClick={() => move(idx, 1)} disabled={idx === steps.length - 1} title={L.moveDown} aria-label={L.moveDown}>↓</button>
              <button type="button" className={`${styles.actionBtn} ${styles.actionDelete}`} onClick={() => onSteps(renumber(steps.filter((x) => x.id !== t.id)))} title={L.remove} aria-label={L.remove}><TrashIcon width="1em" height="1em" /></button>
            </div>
          </div>
        ))}
        <div className={styles.addRow}>
          <input ref={newRef} className={styles.rowInput} placeholder={L.addStep} value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <button type="button" className={styles.confirmBtn} onClick={add} disabled={!newTitle.trim()}>{L.add}</button>
        </div>
      </div>
      <div className={styles.section}>
        <span className={styles.label}>{L.repeat}</span>
        <div className={styles.presets}>
          <button type="button" className={`${styles.presetBtn} ${everyDay ? styles.presetBtnActive : ''}`} onClick={() => onDays([])}>{L.everyDay}</button>
          <button type="button" className={`${styles.presetBtn} ${isWeekdays ? styles.presetBtnActive : ''}`} onClick={() => onDays(WEEKDAYS)}>{L.weekdays}</button>
        </div>
        <div className={styles.dayPicker}>
          {LABELS.recurring.dayName.map((name, i) => (
            <button key={i} type="button" aria-pressed={daysOfWeek.includes(i)} className={`${styles.dayBtn} ${daysOfWeek.includes(i) ? styles.dayBtnActive : ''}`}
              onClick={() => onDays(daysOfWeek.includes(i) ? daysOfWeek.filter((d) => d !== i) : [...daysOfWeek, i].sort())}>
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
        {everyDay && <p className={styles.hint}>{L.everyDayHint}</p>}
      </div>
    </>
  );
}

// ── A tracker: its columns, started from a template when new ───────────────

const TYPE_ICON: Record<FieldType, string> = {
  text: 'T', number: '#', duration: '⏱', boolean: '✓', rating: '★',
  // period is an Endeavour's field only, never a tracker column.
  select: '▾', date: '📅', url: '🔗', period: '🗓', dateRange: '↔',
};
const TEMPLATES: TrackerTemplate[] = ['habit', 'books', 'movies', 'custom'];

// One column's settings, for a new one and an existing one alike.
function ColumnFields({ field, onChange }: { field: FieldSchema; onChange: (patch: Partial<FieldSchema>) => void }) {
  return (
    <>
      <div className={styles.mini}>
        <label className={styles.miniLabel}>{L.name}</label>
        <input className={styles.rowInput} value={field.name} placeholder={L.columnName} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className={styles.mini}>
        <label className={styles.miniLabel}>{L.type}</label>
        <select className={styles.select} value={field.type} onChange={(e) => onChange({ type: e.target.value as FieldType })}>
          {FIELD_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={field.required ?? false} onChange={(e) => onChange({ required: e.target.checked })} />
        {L.required}
      </label>
      {field.type === 'rating' && (
        <div className={styles.mini}>
          <label className={styles.miniLabel}>{L.maxStars}</label>
          <input className={styles.rowInput} type="number" min={1} max={10} value={field.max ?? 5} onChange={(e) => onChange({ max: Number(e.target.value) || 5 })} />
        </div>
      )}
      {field.type === 'number' && (
        <div className={styles.mini}>
          <label className={styles.miniLabel}>{L.unit}</label>
          <input className={styles.rowInput} placeholder={L.unitPlaceholder} value={field.unit ?? ''} onChange={(e) => onChange({ unit: e.target.value })} />
        </div>
      )}
      {field.type === 'select' && (
        <div className={styles.mini}>
          <label className={styles.miniLabel}>{L.options}</label>
          <textarea className={styles.textarea} rows={3} value={(field.options ?? []).join('\n')}
            onChange={(e) => onChange({ options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        </div>
      )}
    </>
  );
}

export function TrackerFields({ fields, onFields, template, onTemplate, hasData }: {
  fields: FieldSchema[]; onFields: (next: FieldSchema[]) => void;
  // A new tracker starts from a template, which fills in its columns (still changeable).
  template?: TrackerTemplate; onTemplate?: (t: TrackerTemplate) => void;
  // Whether entries hold anything in a column (removing one then asks first).
  hasData?: (fieldId: string) => boolean;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState<FieldSchema | null>(null);
  const toggle = (id: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const update = (id: string, patch: Partial<FieldSchema>) => onFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= fields.length) return;
    const arr = [...fields];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    onFields(arr);
  };
  const remove = async (f: FieldSchema) => {
    if (hasData?.(f.id) && !(await confirmDialog({ title: L.removeColumnTitle(f.name), message: L.removeColumnMessage, confirmLabel: L.remove, destructive: true }))) return;
    onFields(fields.filter((x) => x.id !== f.id));
  };
  const commitAdd = () => {
    if (!adding?.name.trim()) return;
    onFields([...fields, { ...adding, name: adding.name.trim() }]);
    setAdding(null);
  };
  return (
    <>
      {template !== undefined && onTemplate && (
        <div className={styles.field}>
          <span className={styles.label}>{L.template}</span>
          <div className={styles.templateGrid}>
            {TEMPLATES.map((t) => (
              <button key={t} type="button" aria-pressed={template === t} className={`${styles.templateCard} ${template === t ? styles.templateCardActive : ''}`} onClick={() => onTemplate(t)}>
                <span className={styles.templateLabel}>{TRACKER_TEMPLATES[t].label}</span>
                <span className={styles.templateDesc}>{TRACKER_TEMPLATES[t].description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.label}>{L.columns}</span>
          <span className={styles.meta}>{L.columnCount(fields.length)}</span>
        </div>
        {fields.length === 0 && !adding && <p className={styles.empty}>{L.noColumns}</p>}
        {fields.map((f, idx) => (
          <div key={f.id} className={styles.row}>
            <div className={styles.rowTop}>
              <span className={styles.rowMeta}>
                <span className={styles.typeIcon} aria-hidden="true">{TYPE_ICON[f.type]}</span>
                <span className={styles.rowName}>{f.name}</span>
                <span className={styles.badge}>{f.type}</span>
                {f.required && <span className={styles.badge}>{L.requiredShort}</span>}
              </span>
              <span className={styles.rowActions}>
                <button type="button" className={styles.actionBtn} onClick={() => move(idx, -1)} disabled={idx === 0} title={L.moveUp} aria-label={L.moveUp}>↑</button>
                <button type="button" className={styles.actionBtn} onClick={() => move(idx, 1)} disabled={idx === fields.length - 1} title={L.moveDown} aria-label={L.moveDown}>↓</button>
                <button type="button" className={styles.actionBtn} onClick={() => toggle(f.id)} aria-expanded={open.has(f.id)} title={L.edit} aria-label={L.edit}><EditIcon width="1em" height="1em" /></button>
                <button type="button" className={`${styles.actionBtn} ${styles.actionDelete}`} onClick={() => void remove(f)} title={L.remove} aria-label={L.remove}><TrashIcon width="1em" height="1em" /></button>
              </span>
            </div>
            {open.has(f.id) && <div className={styles.expanded}><ColumnFields field={f} onChange={(patch) => update(f.id, patch)} /></div>}
          </div>
        ))}
        {adding ? (
          <div className={styles.addForm}>
            <ColumnFields field={adding} onChange={(patch) => setAdding({ ...adding, ...patch })} />
            <div className={styles.addBtns}>
              <button type="button" className={styles.cancelBtn} onClick={() => setAdding(null)}><CloseIcon width="1em" height="1em" /> {L.cancel}</button>
              <button type="button" className={styles.confirmBtn} onClick={commitAdd} disabled={!adding.name.trim()}>{L.add}</button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.addBtn} onClick={() => setAdding({ id: nanoid(8), name: '', type: 'text', required: false })}>{L.addColumn}</button>
        )}
      </div>
    </>
  );
}
