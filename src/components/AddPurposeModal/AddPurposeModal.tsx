import { useState, useEffect, useRef } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { now } from '@/utils/date';
import styles from './AddPurposeModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

export function AddPurposeModal() {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor]             = useState<string | null>(null);

  const addPurpose       = useTaskStore((s) => s.addPurpose);
  const updatePurpose    = useTaskStore((s) => s.updatePurpose);
  const closeModal       = useUIStore((s) => s.closeModal);
  const editingPurpose   = useUIStore((s) => s.editingPurpose);
  const closeEditPurpose = useUIStore((s) => s.closeEditPurpose);

  const isEdit = editingPurpose !== null;

  useEffect(() => {
    if (editingPurpose) {
      setName(editingPurpose.name);
      setDescription(editingPurpose.description ?? '');
      setColor(editingPurpose.color);
    } else {
      setName(''); setDescription(''); setColor(null);
    }
  }, [editingPurpose?.id]);

  const handleClose = () => isEdit ? closeEditPurpose() : closeModal();
  const formRef = useRef<HTMLFormElement>(null);

  useEscapeClose(() => { handleClose(); });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isEdit, closeEditPurpose, closeModal]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isEdit && editingPurpose) {
      updatePurpose(editingPurpose.id, { name: name.trim(), description: description.trim() || null, color });
      closeEditPurpose();
    } else {
      addPurpose({ name, description: description || null, color });
      closeModal();
    }
  };

  const handleToggleArchive = () => {
    if (!editingPurpose) return;
    updatePurpose(editingPurpose.id, { archivedAt: editingPurpose.archivedAt ? null : now() });
    closeEditPurpose();
  };

  const handleOverlay = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  return (
    <div className={styles.overlay} onClick={handleOverlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>
            {isEdit ? 'Edit Purpose' : 'New Purpose / Area'}
            {isEdit && editingPurpose.archivedAt && (
              <span className={styles.archivedBadge}>Archived</span>
            )}
          </span>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">✕</button>
        </div>

        {!isEdit && (
          <p className={styles.hint}>
            A Purpose is a broad life area — e.g. <em>Career</em>, <em>Health</em>, <em>Education</em>.
            Projects and lists can be grouped under one or more Purposes.
          </p>
        )}

        <form ref={formRef} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <input
              className={styles.input}
              placeholder="e.g. Career, Self-Improvement"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <textarea
              className={styles.textarea}
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Colour</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div className={styles.actions}>
            {isEdit && (
              <button type="button" className={styles.archiveBtn} onClick={handleToggleArchive}>
                {editingPurpose.archivedAt ? 'Restore' : 'Archive'}
              </button>
            )}
            <span className={styles.actionsSpacer} />
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={!name.trim()}>
              {isEdit ? 'Save Purpose' : 'Create Purpose'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
