import { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { useFitnessStore } from '@/store/fitnessStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import type { ActivityFieldSchema, ActivityFieldType, ActivityTypeId } from '@/types/fitness';
import styles from './EditActivityTypeModal.module.css';

const FIELD_TYPES: { value: ActivityFieldType; label: string }[] = [
  { value: 'text',     label: 'Text' },
  { value: 'number',   label: 'Number' },
  { value: 'duration', label: 'Duration (h/m/s)' },
  { value: 'boolean',  label: 'Checkbox' },
  { value: 'rating',   label: 'Rating' },
  { value: 'select',   label: 'Select' },
  { value: 'date',     label: 'Date' },
  { value: 'url',      label: 'URL' },
];

const TYPE_ICON: Record<ActivityFieldType, string> = {
  text: 'T', number: '#', duration: '⏱', boolean: '✓', rating: '★',
  select: '▾', date: '📅', url: '🔗',
};

interface FieldRow {
  schema:   ActivityFieldSchema;
  expanded: boolean;
}

function fieldToRow(f: ActivityFieldSchema): FieldRow {
  return { schema: { ...f }, expanded: false };
}

export function EditActivityTypeModal() {
  const activityTypes    = useFitnessStore((s) => s.activityTypes);
  const activities       = useFitnessStore((s) => s.activities);
  const addActivityType    = useFitnessStore((s) => s.addActivityType);
  const updateActivityType = useFitnessStore((s) => s.updateActivityType);
  const deleteActivityType = useFitnessStore((s) => s.deleteActivityType);

  const editActivityTypeOpen  = useUIStore((s) => s.editActivityTypeOpen);
  const editingActivityTypeId = useUIStore((s) => s.editingActivityTypeId);
  const closeEditActivityType = useUIStore((s) => s.closeEditActivityType);

  const editingType = editingActivityTypeId
    ? (activityTypes[editingActivityTypeId as ActivityTypeId] ?? null)
    : null;
  const isEditMode = editingActivityTypeId !== null;

  const [name,   setName]   = useState('');
  const [icon,   setIcon]   = useState('');
  const [color,  setColor]  = useState<string | null>(null);
  const [tracksDistance, setTracksDistance] = useState(true);
  const [fields, setFields] = useState<FieldRow[]>([]);

  const [addingField, setAddingField]   = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<ActivityFieldType>('text');
  const [newFieldReq,  setNewFieldReq]  = useState(false);
  const [newFieldMax,  setNewFieldMax]  = useState('5');
  const [newFieldUnit, setNewFieldUnit] = useState('');
  const [newFieldOpts, setNewFieldOpts] = useState('');

  useEffect(() => {
    if (!editActivityTypeOpen) return;
    if (editingType) {
      setName(editingType.name);
      setIcon(editingType.icon);
      setColor(editingType.color);
      setTracksDistance(editingType.tracksDistance);
      setFields(editingType.fieldSchema.map(fieldToRow));
    } else {
      setName('');
      setIcon('');
      setColor(null);
      setTracksDistance(true);
      setFields([]);
    }
    setAddingField(false);
  }, [editActivityTypeOpen, editingActivityTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editActivityTypeOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeEditActivityType(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && name.trim()) { e.preventDefault(); handleSave(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // No dependency array: re-subscribes every render so Ctrl+Enter always calls the current
    // handleSave closure (it reads several pieces of form state besides `name`) instead of a
    // stale one from whenever the effect last happened to re-run.
  });

  if (!editActivityTypeOpen) return null;

  const activityCount = editingType
    ? Object.values(activities).filter((a) => a.type === editingType.id).length
    : 0;

  function toggleExpand(idx: number) {
    setFields((prev) => prev.map((r, i) => i === idx ? { ...r, expanded: !r.expanded } : r));
  }

  function updateField(idx: number, patch: Partial<ActivityFieldSchema>) {
    setFields((prev) => prev.map((r, i) => i === idx ? { ...r, schema: { ...r.schema, ...patch } } : r));
  }

  function removeField(idx: number) {
    const f = fields[idx].schema;
    const hasData = activityCount > 0 && Object.values(activities).some(
      (a) => a.type === editingActivityTypeId && a.data[f.id] !== undefined && a.data[f.id] !== null && a.data[f.id] !== ''
    );
    if (hasData && !window.confirm(`Remove "${f.name}"? Existing activity data for this field will be hidden (not deleted).`)) return;
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveField(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= fields.length) return;
    setFields((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  function commitAddField() {
    const fname = newFieldName.trim();
    if (!fname) return;
    const base: ActivityFieldSchema = { id: nanoid(8), name: fname, type: newFieldType, required: newFieldReq };
    if (newFieldType === 'rating') base.max = Number(newFieldMax) || 5;
    if (newFieldType === 'number' && newFieldUnit.trim()) base.unit = newFieldUnit.trim();
    if (newFieldType === 'select') {
      base.options = newFieldOpts.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    setFields((prev) => [...prev, { schema: base, expanded: false }]);
    setNewFieldName(''); setNewFieldType('text'); setNewFieldReq(false);
    setNewFieldMax('5'); setNewFieldUnit(''); setNewFieldOpts('');
    setAddingField(false);
  }

  function handleSave() {
    if (!name.trim()) return;
    if (isEditMode && editingType) {
      updateActivityType(editingType.id, {
        name: name.trim(),
        icon: icon.trim() || '⛰️',
        color,
        tracksDistance,
        fieldSchema: fields.map((r) => r.schema),
      });
    } else {
      addActivityType({
        name: name.trim(),
        icon: icon.trim() || undefined,
        color,
        tracksDistance,
        fieldSchema: fields.map((r) => r.schema),
      });
    }
    closeEditActivityType();
  }

  function handleDelete() {
    if (!editingType) return;
    const warning = activityCount > 0
      ? `Delete "${editingType.name}"? ${activityCount} activit${activityCount === 1 ? 'y' : 'ies'} using it will show as an unknown type.`
      : `Delete "${editingType.name}"?`;
    if (!window.confirm(warning)) return;
    deleteActivityType(editingType.id);
    closeEditActivityType();
  }

  return (
    <>
      <div className={styles.overlay} onClick={closeEditActivityType} />
      <aside className={styles.pane} role="complementary" aria-label={isEditMode ? 'Edit activity type' : 'New activity type'}>
        <div className={styles.header}>
          <span className={styles.heading}>{isEditMode ? 'Edit activity type' : 'New activity type'}</span>
          <button className={styles.closeBtn} onClick={closeEditActivityType} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          {editingType?.isBuiltIn && (
            <p className={styles.builtinHint}>This is a built-in type — its name, icon and fields are still fully editable, but it can't be deleted.</p>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="eatm-name">Name</label>
            <input
              id="eatm-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="eatm-icon">Icon <span className={styles.optional}>(emoji)</span></label>
            <input
              id="eatm-icon"
              className={`${styles.input} ${styles.iconInput}`}
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="⛰️"
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Color</span>
            <ColorPicker palette="standard" value={color} onChange={setColor} />
          </div>

          <div className={styles.field}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={tracksDistance}
                onChange={(e) => setTracksDistance(e.target.checked)}
              />
              Has a distance (shows the Distance field when logging this activity)
            </label>
          </div>

          {/* ── Field schema editor ──────────────────────────────────────────── */}
          <div className={styles.schemaSection}>
            <div className={styles.schemaHeader}>
              <span className={styles.label}>Fields captured</span>
              <span className={styles.schemaMeta}>{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
            </div>

            {fields.length === 0 && !addingField && (
              <p className={styles.noFields}>Distance, moving time, title, date and notes are always captured. Add fields here for anything else this activity type should track (e.g. Sets, Pool length, Heart rate).</p>
            )}

            {fields.map((row, idx) => (
              <div key={row.schema.id} className={styles.fieldRow}>
                <div className={styles.fieldRowTop}>
                  <div className={styles.fieldRowMeta}>
                    <span className={styles.fieldTypeIcon}>{TYPE_ICON[row.schema.type]}</span>
                    <span className={styles.fieldName}>{row.schema.name}</span>
                    <span className={styles.fieldTypeBadge}>{row.schema.type}</span>
                    {row.schema.required && <span className={styles.requiredBadge}>req</span>}
                  </div>
                  <div className={styles.fieldRowActions}>
                    <button className={styles.fieldActionBtn} onClick={() => moveField(idx, -1)} disabled={idx === 0} title="Move up">↑</button>
                    <button className={styles.fieldActionBtn} onClick={() => moveField(idx, 1)} disabled={idx === fields.length - 1} title="Move down">↓</button>
                    <button className={styles.fieldActionBtn} onClick={() => toggleExpand(idx)} title="Configure">⚙</button>
                    <button className={`${styles.fieldActionBtn} ${styles.fieldActionBtnDelete}`} onClick={() => removeField(idx)} title="Remove">✕</button>
                  </div>
                </div>

                {row.expanded && (
                  <div className={styles.fieldExpanded}>
                    <div className={styles.fieldMini}>
                      <label className={styles.miniLabel}>Name</label>
                      <input
                        className={styles.miniInput}
                        value={row.schema.name}
                        onChange={(e) => updateField(idx, { name: e.target.value })}
                      />
                    </div>

                    <div className={styles.fieldMini}>
                      <label className={styles.miniLabel}>Type</label>
                      <select
                        className={styles.miniSelect}
                        value={row.schema.type}
                        onChange={(e) => updateField(idx, { type: e.target.value as ActivityFieldType })}
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    <label className={styles.fieldMiniCheck}>
                      <input
                        type="checkbox"
                        checked={row.schema.required ?? false}
                        onChange={(e) => updateField(idx, { required: e.target.checked })}
                      />
                      Required
                    </label>

                    {row.schema.type === 'rating' && (
                      <div className={styles.fieldMini}>
                        <label className={styles.miniLabel}>Max stars</label>
                        <input
                          className={styles.miniInput}
                          type="number"
                          min={1} max={10}
                          value={row.schema.max ?? 5}
                          onChange={(e) => updateField(idx, { max: Number(e.target.value) || 5 })}
                        />
                      </div>
                    )}

                    {row.schema.type === 'number' && (
                      <div className={styles.fieldMini}>
                        <label className={styles.miniLabel}>Unit</label>
                        <input
                          className={styles.miniInput}
                          placeholder="e.g. bpm, reps"
                          value={row.schema.unit ?? ''}
                          onChange={(e) => updateField(idx, { unit: e.target.value })}
                        />
                      </div>
                    )}

                    {row.schema.type === 'select' && (
                      <div className={styles.fieldMini}>
                        <label className={styles.miniLabel}>Options (one per line)</label>
                        <textarea
                          className={styles.miniTextarea}
                          rows={3}
                          value={(row.schema.options ?? []).join('\n')}
                          onChange={(e) =>
                            updateField(idx, {
                              options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {addingField ? (
              <div className={styles.addFieldForm}>
                <div className={styles.addFieldRow}>
                  <input
                    className={styles.miniInput}
                    placeholder="Field name"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    autoFocus
                  />
                  <select
                    className={styles.miniSelect}
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as ActivityFieldType)}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <label className={styles.fieldMiniCheck}>
                  <input type="checkbox" checked={newFieldReq} onChange={(e) => setNewFieldReq(e.target.checked)} />
                  Required
                </label>

                {newFieldType === 'rating' && (
                  <div className={styles.fieldMini}>
                    <label className={styles.miniLabel}>Max stars</label>
                    <input className={styles.miniInput} type="number" min={1} max={10} value={newFieldMax} onChange={(e) => setNewFieldMax(e.target.value)} />
                  </div>
                )}
                {newFieldType === 'number' && (
                  <div className={styles.fieldMini}>
                    <label className={styles.miniLabel}>Unit</label>
                    <input className={styles.miniInput} placeholder="e.g. bpm, reps" value={newFieldUnit} onChange={(e) => setNewFieldUnit(e.target.value)} />
                  </div>
                )}
                {newFieldType === 'select' && (
                  <div className={styles.fieldMini}>
                    <label className={styles.miniLabel}>Options (one per line)</label>
                    <textarea className={styles.miniTextarea} rows={3} value={newFieldOpts} onChange={(e) => setNewFieldOpts(e.target.value)} />
                  </div>
                )}

                <div className={styles.addFieldBtns}>
                  <button className={styles.addFieldCancelBtn} type="button" onClick={() => setAddingField(false)}>Cancel</button>
                  <button className={styles.addFieldConfirmBtn} type="button" onClick={commitAddField} disabled={!newFieldName.trim()}>Add</button>
                </div>
              </div>
            ) : (
              <button className={styles.addFieldBtn} onClick={() => setAddingField(true)}>+ Add field</button>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          {isEditMode && !editingType?.isBuiltIn && (
            <button className={styles.deleteBtn} onClick={handleDelete}>Delete type</button>
          )}
          <button className={styles.saveBtn} onClick={handleSave} disabled={!name.trim()}>
            {isEditMode ? 'Save changes' : 'Create type'}
          </button>
        </div>
      </aside>
    </>
  );
}
