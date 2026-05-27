import { useState, useEffect } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useUIStore } from '@/store/uiStore';
import type { FieldSchema, CollectionId, TrackerEntryId } from '@/types';
import { todayIso } from '@/utils/date';
import styles from './AddEntryModal.module.css';

// ── Field renderer ────────────────────────────────────────────────

interface FieldInputProps {
  field: FieldSchema;
  value: unknown;
  onChange: (val: unknown) => void;
}

function FieldInput({ field, value, onChange }: FieldInputProps) {
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
            >
              ★
            </button>
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
          <input
            className={styles.durationInput}
            type="number"
            min={0}
            value={totalSecs === 0 && h === 0 ? '' : h}
            placeholder="0"
            onChange={(e) => {
              const newH = Math.max(0, Number(e.target.value) || 0);
              onChange(newH * 3600 + m * 60 + s);
            }}
          />
          <span className={styles.durationLabel}>h</span>
          <input
            className={styles.durationInput}
            type="number"
            min={0}
            max={59}
            value={totalSecs === 0 && m === 0 ? '' : m}
            placeholder="0"
            onChange={(e) => {
              const newM = Math.min(59, Math.max(0, Number(e.target.value) || 0));
              onChange(h * 3600 + newM * 60 + s);
            }}
          />
          <span className={styles.durationLabel}>m</span>
          <input
            className={styles.durationInput}
            type="number"
            min={0}
            max={59}
            value={totalSecs === 0 && s === 0 ? '' : s}
            placeholder="0"
            onChange={(e) => {
              const newS = Math.min(59, Math.max(0, Number(e.target.value) || 0));
              onChange(h * 3600 + m * 60 + newS);
            }}
          />
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

// ── Modal ─────────────────────────────────────────────────────────

export function AddEntryModal() {
  const collections   = useTaskStore((s) => s.collections);
  const entries       = useTrackerStore((s) => s.entries);
  const addEntry      = useTrackerStore((s) => s.addEntry);
  const updateEntry   = useTrackerStore((s) => s.updateEntry);

  const openModal        = useUIStore((s) => s.openModal);
  const pendingTrackerId = useUIStore((s) => s.pendingTrackerId);
  const editingEntryId   = useUIStore((s) => s.editingEntryId);
  const closeModal       = useUIStore((s) => s.closeModal);

  const [date,  setDate]  = useState<string>(todayIso());
  const [data,  setData]  = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState('');

  const isVisible = openModal === 'add-entry';

  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isVisible, closeModal]);

  const tracker = pendingTrackerId
    ? (collections[pendingTrackerId as CollectionId] ?? null)
    : null;

  const editingEntry = editingEntryId
    ? (entries[editingEntryId as TrackerEntryId] ?? null)
    : null;

  const resolvedTracker = tracker ?? (
    editingEntry ? (collections[editingEntry.trackerId as CollectionId] ?? null) : null
  );

  useEffect(() => {
    if (!isVisible) return;
    if (editingEntry) {
      setDate(editingEntry.date);
      setData(editingEntry.data ?? {});
      setNotes(editingEntry.notes ?? '');
    } else {
      setDate(todayIso());
      setData({});
      setNotes('');
    }
  }, [isVisible, editingEntry?.id]);

  if (!isVisible) return null;

  function setField(id: string, val: unknown) {
    setData((prev) => ({ ...prev, [id]: val }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resolvedTracker) return;

    if (editingEntry) {
      updateEntry(editingEntry.id, { date, data, notes: notes || null });
    } else {
      addEntry({
        trackerId: resolvedTracker.id,
        date,
        data,
        notes: notes || null,
      });
    }
    closeModal();
  }

  if (!resolvedTracker) return null;

  const schema: FieldSchema[] = resolvedTracker.fieldSchema ?? [];
  const title = editingEntry ? 'Edit entry' : `New entry — ${resolvedTracker.name}`;

  return (
    <div className={styles.overlay} onMouseDown={closeModal}>
      <div
        className={styles.modal}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Date */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="aem-date">Date</label>
            <input
              id="aem-date"
              className={styles.input}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Dynamic fields */}
          {schema.map((f) => (
            f.type === 'boolean' ? (
              <div key={f.id} className={styles.field}>
                <FieldInput field={f} value={data[f.id]} onChange={(v) => setField(f.id, v)} />
              </div>
            ) : (
              <div key={f.id} className={styles.field}>
                <label className={styles.fieldLabel}>
                  {f.name}
                  {f.required && <span className={styles.required}> *</span>}
                </label>
                <FieldInput field={f} value={data[f.id]} onChange={(v) => setField(f.id, v)} />
              </div>
            )
          ))}

          {/* Notes */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="aem-notes">Notes</label>
            <textarea
              id="aem-notes"
              className={styles.textarea}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button type="submit" className={styles.submitBtn}>
              {editingEntry ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
