import { useState, useEffect } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import styles from './AddPurposeModal.module.css';

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isEdit && editingPurpose) {
      updatePurpose(editingPurpose.id, { name: name.trim(), color });
      closeEditPurpose();
    } else {
      addPurpose({ name, description: description || null, color });
      closeModal();
    }
  };

  const handleOverlay = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  return (
    <div className={styles.overlay} onClick={handleOverlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>{isEdit ? 'Edit Purpose' : 'New Purpose / Area'}</span>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">✕</button>
        </div>

        {!isEdit && (
          <p className={styles.hint}>
            A Purpose is a broad life area — e.g. <em>Career</em>, <em>Health</em>, <em>Education</em>.
            Projects and lists can be grouped under one or more Purposes.
          </p>
        )}

        <form onSubmit={handleSubmit}>
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
