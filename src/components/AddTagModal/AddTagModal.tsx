import { useState, useEffect } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { newTagId } from '@/utils/id';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import styles from './AddTagModal.module.css';

export function AddTagModal() {
  const [name, setName]   = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');

  const addTag       = useTaskStore((s) => s.addTag);
  const updateTag    = useTaskStore((s) => s.updateTag);
  const closeModal   = useUIStore((s) => s.closeModal);
  const editingTag   = useUIStore((s) => s.editingTag);
  const closeEditTag = useUIStore((s) => s.closeEditTag);

  const isEdit = editingTag !== null;

  useEffect(() => {
    if (editingTag) { setName(editingTag.name); setColor(editingTag.color); setNotes(editingTag.notes ?? ''); }
    else            { setName(''); setColor(null); setNotes(''); }
  }, [editingTag?.id]);

  const handleClose = () => isEdit ? closeEditTag() : closeModal();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isEdit && editingTag) {
      updateTag(editingTag.id, { name: name.trim(), color, notes: notes.trim() || null });
      closeEditTag();
    } else {
      addTag({ id: newTagId(), name: name.trim(), color, notes: notes.trim() || null });
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
          <span className={styles.title}>{isEdit ? 'Edit Tag' : 'New Tag'}</span>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <input
              className={styles.input}
              placeholder="Tag name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Colour</label>
            <ColorPicker value={color} onChange={setColor} palette="light" />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="tag-notes">Notes</label>
            <textarea
              id="tag-notes"
              className={styles.textarea}
              placeholder="Optional description"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!name.trim()}
              style={color ? { background: color, color: '#1a1a2e' } : undefined}
            >
              {isEdit ? 'Save Tag' : 'Create Tag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
