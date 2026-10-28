import { useState, useEffect, useRef } from 'react';
import { DateInput } from '@/components/DateInput/DateInput';
import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useUIStore } from '@/store/uiStore';
import type { FieldSchema, CollectionId, TrackerEntryId } from '@/types';
import { todayIso } from '@/utils/date';
import styles from './AddEntryModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { CloseIcon } from '@/components/Icons';
import { FieldInput } from '@/components/FieldInput/FieldInput';

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

  const formRef = useRef<HTMLFormElement>(null);
  const isVisible = openModal === 'add-entry';

  useEscapeClose(() => { closeModal(); }, isVisible);

  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
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

  const [date,  setDate]  = useState<string>(() => editingEntry?.date ?? todayIso());
  const [data,  setData]  = useState<Record<string, unknown>>(() => editingEntry?.data ?? {});
  const [notes, setNotes] = useState(() => editingEntry?.notes ?? '');

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
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label="Close"><CloseIcon /></button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit}>
          {/* Date */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="aem-date">Date</label>
            <DateInput id="aem-date" className={styles.input} value={date} onChange={(v) => setDate(v)} required />
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
