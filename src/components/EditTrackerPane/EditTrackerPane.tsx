import { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import type { FieldSchema, FieldType, CollectionId, PurposeId, TagId } from '@/types';
import styles from './EditTrackerPane.module.css';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Text' },
  { value: 'number',   label: 'Number' },
  { value: 'duration', label: 'Duration (h/m/s)' },
  { value: 'boolean',  label: 'Checkbox' },
  { value: 'rating',   label: 'Rating' },
  { value: 'select',   label: 'Select' },
  { value: 'date',     label: 'Date' },
  { value: 'url',      label: 'URL' },
];

const TYPE_ICON: Record<FieldType, string> = {
  text: 'T', number: '#', duration: '⏱', boolean: '✓', rating: '★',
  select: '▾', date: '📅', url: '🔗',
};

interface FieldRow {
  schema:   FieldSchema;
  expanded: boolean;
}

function fieldToRow(f: FieldSchema): FieldRow {
  return { schema: { ...f }, expanded: false };
}

export function EditTrackerPane() {
  const collections    = useTaskStore((s) => s.collections);
  const updateCollection = useTaskStore((s) => s.updateCollection);
  const purposes       = useTaskStore((s) => s.purposes);
  const tags           = useTaskStore((s) => s.tags);
  const entries        = useTrackerStore((s) => s.entries);

  const editTrackerOpen    = useUIStore((s) => s.editTrackerOpen);
  const editingTrackerId   = useUIStore((s) => s.editingTrackerId);
  const closeEditTracker   = useUIStore((s) => s.closeEditTracker);

  const tracker = editingTrackerId
    ? (collections[editingTrackerId as CollectionId] ?? null)
    : null;

  // ── Form state ────────────────────────────────────────────────────────────
  const [name,        setName]        = useState('');
  const [color,       setColor]       = useState<string | null>(null);
  const [purposeIds,  setPurposeIds]  = useState<PurposeId[]>([]);
  const [tagIds,      setTagIds]      = useState<TagId[]>([]);
  const [fields,      setFields]      = useState<FieldRow[]>([]);

  // New-field form
  const [addingField, setAddingField]       = useState(false);
  const [newFieldName, setNewFieldName]     = useState('');
  const [newFieldType, setNewFieldType]     = useState<FieldType>('text');
  const [newFieldReq,  setNewFieldReq]      = useState(false);
  const [newFieldMax,  setNewFieldMax]      = useState('5');
  const [newFieldUnit, setNewFieldUnit]     = useState('');
  const [newFieldOpts, setNewFieldOpts]     = useState('');

  useEffect(() => {
    if (tracker) {
      setName(tracker.name);
      setColor(tracker.color ?? null);
      setPurposeIds((tracker.purposeIds ?? []) as PurposeId[]);
      setTagIds((tracker.tagIds ?? []) as TagId[]);
      setFields((tracker.fieldSchema ?? []).map(fieldToRow));
    }
  }, [tracker?.id]);

  if (!editTrackerOpen || !tracker) return null;

  // ── Entry count for this tracker (used for deletion warning) ─────────────
  const entryCount = Object.values(entries).filter((e) => e.trackerId === tracker.id).length;

  // ── Field helpers ─────────────────────────────────────────────────────────
  function toggleExpand(idx: number) {
    setFields((prev) => prev.map((r, i) => i === idx ? { ...r, expanded: !r.expanded } : r));
  }

  function updateField(idx: number, patch: Partial<FieldSchema>) {
    setFields((prev) => prev.map((r, i) => i === idx ? { ...r, schema: { ...r.schema, ...patch } } : r));
  }

  function removeField(idx: number) {
    const f = fields[idx].schema;
    const hasData = entryCount > 0 && tracker != null && Object.values(entries).some(
      (e) => e.trackerId === tracker.id && e.data[f.id] !== undefined && e.data[f.id] !== null && e.data[f.id] !== ''
    );
    if (hasData && !window.confirm(`Remove "${f.name}"? Existing entry data for this field will be hidden (not deleted).`)) return;
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
    const name = newFieldName.trim();
    if (!name) return;
    const base: FieldSchema = { id: nanoid(8), name, type: newFieldType, required: newFieldReq };
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

  // ── Save ──────────────────────────────────────────────────────────────────
  function handleSave() {
    if (!name.trim() || !tracker) return;
    updateCollection(tracker.id, {
      name:        name.trim(),
      color,
      purposeIds,
      tagIds,
      fieldSchema: fields.map((r) => r.schema),
    });
    closeEditTracker();
  }

  const purposeList = Object.values(purposes);
  const tagList     = Object.values(tags);

  return (
    <>
      <div className={styles.overlay} onClick={closeEditTracker} />
      <aside className={styles.pane} role="complementary" aria-label="Edit tracker">
        <div className={styles.header}>
          <span className={styles.heading}>Edit tracker</span>
          <button className={styles.closeBtn} onClick={closeEditTracker} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          {/* Name */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="etp-name">Name</label>
            <input
              id="etp-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Color */}
          <div className={styles.field}>
            <span className={styles.label}>Color</span>
            <ColorPicker palette="standard" value={color} onChange={setColor} />
          </div>

          {/* Purposes */}
          {purposeList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>Purposes</span>
              <div className={styles.chips}>
                {purposeList.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.chip} ${purposeIds.includes(p.id as PurposeId) ? styles.chipActive : ''}`}
                    onClick={() => setPurposeIds((prev) =>
                      prev.includes(p.id as PurposeId)
                        ? prev.filter((x) => x !== p.id)
                        : [...prev, p.id as PurposeId]
                    )}
                    style={p.color ? { '--chip-color': p.color } as React.CSSProperties : undefined}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {tagList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>Tags</span>
              <div className={styles.chips}>
                {tagList.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.chip} ${tagIds.includes(t.id as TagId) ? styles.chipActive : ''}`}
                    onClick={() => setTagIds((prev) =>
                      prev.includes(t.id as TagId)
                        ? prev.filter((x) => x !== t.id)
                        : [...prev, t.id as TagId]
                    )}
                    style={t.color ? { '--chip-color': t.color } as React.CSSProperties : undefined}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Field schema editor ──────────────────────────────────────────── */}
          <div className={styles.schemaSection}>
            <div className={styles.schemaHeader}>
              <span className={styles.label}>Fields</span>
              <span className={styles.schemaMeta}>{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
            </div>

            {fields.length === 0 && !addingField && (
              <p className={styles.noFields}>No fields yet. Add one below.</p>
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
                        onChange={(e) => updateField(idx, { type: e.target.value as FieldType })}
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
                          placeholder="e.g. kg, min"
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

            {/* Add field form */}
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
                    onChange={(e) => setNewFieldType(e.target.value as FieldType)}
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
                    <input className={styles.miniInput} placeholder="e.g. kg, min" value={newFieldUnit} onChange={(e) => setNewFieldUnit(e.target.value)} />
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
          <button className={styles.saveBtn} onClick={handleSave} disabled={!name.trim()}>Save changes</button>
        </div>
      </aside>
    </>
  );
}
