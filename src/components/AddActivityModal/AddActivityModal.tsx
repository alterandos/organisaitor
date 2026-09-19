import { useState, useEffect } from 'react';
import { useFitnessStore } from '@/store/fitnessStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { getTopActivityTypes } from '@/utils/fitnessActivityTypes';
import { computeAverageSpeedMps } from '@/utils/fitnessFormat';
import { todayIso } from '@/utils/date';
import type { ActivityFieldSchema, ActivityTypeId } from '@/types/fitness';
import type { PurposeId } from '@/types';
import styles from './AddActivityModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

const NEW_TYPE_VALUE = '__new__';

// ── Custom field renderer (mirrors AddEntryModal's FieldInput, kept Fitness-local) ──

interface FieldInputProps {
  field: ActivityFieldSchema;
  value: unknown;
  onChange: (val: unknown) => void;
}

function ActivityFieldInput({ field, value, onChange }: FieldInputProps) {
  switch (field.type) {
    case 'boolean': {
      const isOn = Boolean(value);
      return (
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          className={`${styles.toggleRow} ${isOn ? styles.toggleRowOn : ''}`}
          onClick={() => onChange(!isOn)}
        >
          <div className={`${styles.toggleTrack} ${isOn ? styles.toggleTrackOn : ''}`}>
            <div className={`${styles.toggleThumb} ${isOn ? styles.toggleThumbOn : ''}`} />
          </div>
          <span className={styles.toggleLabel}>{field.name}</span>
          {isOn && <span className={styles.toggleCheck}>✓</span>}
        </button>
      );
    }

    case 'rating': {
      const max = field.max ?? 5;
      const current = Number(value) || 0;
      return (
        <div className={styles.ratingRow}>
          {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
            <button
              key={star}
              type="button"
              className={`${styles.ratingStar} ${star <= current ? styles.ratingStarActive : ''}`}
              onClick={() => onChange(star === current ? 0 : star)}
            >★</button>
          ))}
        </div>
      );
    }

    case 'select':
      return (
        <select
          className={styles.select}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'number':
      return (
        <input
          className={styles.input}
          type="number"
          value={value === null || value === undefined ? '' : String(value)}
          placeholder={field.unit ? `Value (${field.unit})` : 'Value'}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );

    case 'date':
      return (
        <input
          className={styles.input}
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case 'duration': {
      const totalSecs = Number(value) || 0;
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      return (
        <div className={styles.durationRow}>
          <input className={styles.durationInput} type="number" min={0} value={totalSecs === 0 && h === 0 ? '' : h} placeholder="0"
            onChange={(e) => onChange((Math.max(0, Number(e.target.value) || 0)) * 3600 + m * 60 + s)} />
          <span className={styles.durationLabel}>h</span>
          <input className={styles.durationInput} type="number" min={0} max={59} value={totalSecs === 0 && m === 0 ? '' : m} placeholder="0"
            onChange={(e) => onChange(h * 3600 + (Math.min(59, Math.max(0, Number(e.target.value) || 0))) * 60 + s)} />
          <span className={styles.durationLabel}>m</span>
          <input className={styles.durationInput} type="number" min={0} max={59} value={totalSecs === 0 && s === 0 ? '' : s} placeholder="0"
            onChange={(e) => onChange(h * 3600 + m * 60 + (Math.min(59, Math.max(0, Number(e.target.value) || 0))))} />
          <span className={styles.durationLabel}>s</span>
        </div>
      );
    }

    case 'url':
      return (
        <input
          className={styles.input}
          type="url"
          value={String(value ?? '')}
          placeholder="https://"
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    default: // 'text'
      return (
        <input
          className={styles.input}
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function AddActivityModal() {
  const activityTypes  = useFitnessStore((s) => s.activityTypes);
  const activities     = useFitnessStore((s) => s.activities);
  const addActivity    = useFitnessStore((s) => s.addActivity);
  const updateActivity = useFitnessStore((s) => s.updateActivity);
  const purposes        = useTaskStore((s) => s.purposes);

  const openModal        = useUIStore((s) => s.openModal);
  const editingActivity  = useUIStore((s) => s.editingActivity);
  const closeEditActivity = useUIStore((s) => s.closeEditActivity);
  const showAddActivityType = useUIStore((s) => s.showAddActivityType);
  const openEditActivityType = useUIStore((s) => s.openEditActivityType);

  const isEditMode = editingActivity !== null;
  const isVisible  = openModal === 'add-activity';

  const activeTypes = Object.values(activityTypes).filter((t) => !t.archivedAt);
  const topTypes = getTopActivityTypes(activityTypes, activities, 3);
  const topTypeIds = new Set(topTypes.map((t) => t.id));

  const [type,       setType]       = useState<ActivityTypeId>(topTypes[0]?.id ?? ('run' as ActivityTypeId));
  const [title,      setTitle]      = useState('');
  const [date,       setDate]       = useState(todayIso());
  const [distanceKm, setDistanceKm] = useState('');
  const [hours,      setHours]      = useState('');
  const [minutes,    setMinutes]    = useState('');
  const [notes,      setNotes]      = useState('');
  const [fieldData,  setFieldData]  = useState<Record<string, unknown>>({});
  const [selectedPurposeIds, setSelectedPurposeIds] = useState<PurposeId[]>([]);

  useEffect(() => {
    if (editingActivity) {
      setType(editingActivity.type);
      setTitle(editingActivity.title);
      setDate(editingActivity.startedAt.slice(0, 10));
      setDistanceKm(editingActivity.distanceMeters ? String(editingActivity.distanceMeters / 1000) : '');
      const totalMin = editingActivity.movingTimeSeconds ? Math.round(editingActivity.movingTimeSeconds / 60) : 0;
      setHours(totalMin ? String(Math.floor(totalMin / 60)) : '');
      setMinutes(totalMin ? String(totalMin % 60) : '');
      setNotes(editingActivity.notes ?? '');
      setFieldData(editingActivity.data ?? {});
      setSelectedPurposeIds(editingActivity.purposeIds ?? []);
    } else {
      setType(topTypes[0]?.id ?? ('run' as ActivityTypeId));
      setTitle('');
      setDate(todayIso());
      setDistanceKm('');
      setHours('');
      setMinutes('');
      setNotes('');
      setFieldData({});
      setSelectedPurposeIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingActivity?.id]);

  useEscapeClose(closeEditActivity, isVisible);

  if (!isVisible) return null;

  const purposeList = Object.values(purposes).filter((p) => !p.archivedAt);
  const selectedType = activityTypes[type] ?? null;
  const customFields = selectedType?.fieldSchema ?? [];
  const tracksDistance = selectedType?.tracksDistance ?? true;

  function togglePurpose(id: PurposeId) {
    setSelectedPurposeIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function setFieldValue(id: string, val: unknown) {
    setFieldData((prev) => ({ ...prev, [id]: val }));
  }

  function handleDropdownChange(value: string) {
    if (value === NEW_TYPE_VALUE) {
      showAddActivityType();
      return;
    }
    if (value) setType(value as ActivityTypeId);
  }

  const distanceMeters = tracksDistance && distanceKm.trim() ? Math.round(parseFloat(distanceKm) * 1000) : null;
  const movingTimeSeconds = (hours.trim() || minutes.trim())
    ? (Number(hours || 0) * 3600) + (Number(minutes || 0) * 60)
    : null;
  const averageSpeedMps = tracksDistance ? computeAverageSpeedMps(distanceMeters, movingTimeSeconds) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim() || selectedType?.name || 'Activity';

    if (isEditMode && editingActivity) {
      updateActivity(editingActivity.id, {
        type,
        title: trimmedTitle,
        startedAt: date,
        distanceMeters,
        movingTimeSeconds,
        averageSpeedMps,
        data: fieldData,
        notes: notes.trim() || null,
        purposeIds: selectedPurposeIds,
      });
      closeEditActivity();
    } else {
      addActivity({
        type,
        title: trimmedTitle,
        startedAt: date,
        distanceMeters,
        movingTimeSeconds,
        averageSpeedMps,
        data: fieldData,
        notes: notes.trim() || null,
        purposeIds: selectedPurposeIds,
        source: 'manual',
      });
      closeEditActivity();
    }
  }

  function handleDelete() {
    if (!editingActivity) return;
    if (!window.confirm(`Delete "${editingActivity.title}"?`)) return;
    useFitnessStore.getState().deleteActivity(editingActivity.id);
    closeEditActivity();
  }

  return (
    <div className={styles.overlay} onMouseDown={closeEditActivity}>
      <div
        className={styles.modal}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEditMode ? 'Edit activity' : 'New activity'}
      >
        <div className={styles.header}>
          <span className={styles.title}>
            {isEditMode ? 'Edit activity' : 'New activity'}
            {isEditMode && editingActivity.source === 'strava' && (
              <span className={styles.sourceBadge}>Strava</span>
            )}
          </span>
          <button type="button" className={styles.closeBtn} onClick={closeEditActivity} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Type</span>
            <div className={styles.typeRow}>
              <div className={styles.typeSelector}>
                {topTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.typeBtn} ${type === t.id ? styles.typeBtnActive : ''}`}
                    onClick={() => setType(t.id)}
                  >
                    <span>{t.icon}</span> {t.name}
                  </button>
                ))}
              </div>
              <select
                className={styles.moreSelect}
                value={topTypeIds.has(type) ? '' : type}
                onChange={(e) => handleDropdownChange(e.target.value)}
                aria-label="More activity types"
              >
                <option value="" disabled>More…</option>
                {activeTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                ))}
                <option value={NEW_TYPE_VALUE}>+ New activity type…</option>
              </select>
              <button
                type="button"
                className={styles.customiseBtn}
                onClick={() => selectedType && openEditActivityType(selectedType.id)}
                disabled={!selectedType}
                title={`Customise ${selectedType?.name ?? 'activity type'}`}
              >⚙</button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="aam-title">Title</label>
            <input
              id="aam-title"
              className={styles.input}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedType?.name}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="aam-date">Date</label>
            <input
              id="aam-date"
              className={styles.input}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className={tracksDistance ? styles.row : undefined}>
            {tracksDistance && (
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="aam-distance">Distance (km)</label>
                <input
                  id="aam-distance"
                  className={styles.input}
                  type="number"
                  min={0}
                  step={0.01}
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </div>
            )}

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Moving time</span>
              <div className={styles.durationRow}>
                <input
                  className={styles.durationInput}
                  type="number"
                  min={0}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="0"
                />
                <span className={styles.durationLabel}>h</span>
                <input
                  className={styles.durationInput}
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="0"
                />
                <span className={styles.durationLabel}>m</span>
              </div>
            </div>
          </div>

          {averageSpeedMps !== null && (
            <p className={styles.speedPreview}>Average speed: {(averageSpeedMps * 3.6).toFixed(1)} km/h</p>
          )}

          {customFields.length > 0 && (
            <div className={styles.customFieldsSection}>
              {customFields.map((f) => (
                f.type === 'boolean' ? (
                  <div key={f.id} className={styles.field}>
                    <ActivityFieldInput field={f} value={fieldData[f.id]} onChange={(v) => setFieldValue(f.id, v)} />
                  </div>
                ) : (
                  <div key={f.id} className={styles.field}>
                    <label className={styles.fieldLabel}>
                      {f.name}{f.required && <span className={styles.required}> *</span>}
                    </label>
                    <ActivityFieldInput field={f} value={fieldData[f.id]} onChange={(v) => setFieldValue(f.id, v)} />
                  </div>
                )
              ))}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="aam-notes">Notes</label>
            <textarea
              id="aam-notes"
              className={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>

          {purposeList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Purposes</span>
              <div className={styles.chips}>
                {purposeList.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.chip} ${selectedPurposeIds.includes(p.id as PurposeId) ? styles.chipSelected : ''}`}
                    onClick={() => togglePurpose(p.id as PurposeId)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.actions}>
            {isEditMode && (
              <button type="button" className={styles.deleteBtn} onClick={handleDelete}>Delete</button>
            )}
            <span className={styles.actionsSpacer} />
            <button type="button" className={styles.cancelBtn} onClick={closeEditActivity}>Cancel</button>
            <button type="submit" className={styles.submitBtn}>{isEditMode ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
