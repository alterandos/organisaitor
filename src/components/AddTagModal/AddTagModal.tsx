import { useRef, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { newTagId } from '@/utils/id';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { IconField } from '@/components/IconPicker/IconField';
import { FieldError } from '@/components/FieldError/FieldError';
import { findTag } from '@/services/tags';
import { tagUses } from '@/services/inUse';
import { LABELS } from '@/config/labels';
import { now } from '@/utils/date';
import styles from './AddTagModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CloseIcon } from '@/components/Icons';

// Making or editing one of the suite's tags (types/index.ts Tag): its name, icon, colour and notes;
// editing also says how many things it's on and archives it (off the pickers, kept where it is).

const L = LABELS.tagModal;

export function AddTagModal() {
  const addTag       = useTaskStore((s) => s.addTag);
  const updateTag    = useTaskStore((s) => s.updateTag);
  const closeModal   = useUIStore((s) => s.closeModal);
  const editingTag   = useUIStore((s) => s.editingTag);
  const closeEditTag = useUIStore((s) => s.closeEditTag);
  const live         = useTaskStore((s) => (editingTag ? s.tags[editingTag.id] : undefined));

  const isEdit = editingTag !== null;

  const [name, setName]   = useState(() => editingTag?.name ?? '');
  const [icon, setIcon]   = useState<string | null>(() => editingTag?.icon ?? null);
  const [color, setColor] = useState<string | null>(() => editingTag?.color ?? null);
  const [notes, setNotes] = useState<string>(() => editingTag?.notes ?? '');
  const [showErrors, setShowErrors] = useState(false);
  const [uses] = useState(() => (editingTag ? tagUses(editingTag.id) : 0));

  const handleClose = () => isEdit ? closeEditTag() : closeModal();
  const formRef = useRef<HTMLFormElement>(null);

  useEscapeClose(() => { handleClose(); });
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  const clash = findTag(name);
  const error = !name.trim() ? L.nameNeeded : clash && clash.id !== editingTag?.id ? L.nameTaken(clash.name) : null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (error) { setShowErrors(true); return; }
    if (isEdit && editingTag) {
      updateTag(editingTag.id, { name: name.trim(), icon, color, notes: notes.trim() || null });
      closeEditTag();
    } else {
      addTag({ id: newTagId(), name: name.trim(), icon, color, notes: notes.trim() || null });
      closeModal();
    }
  };

  function toggleArchive() {
    if (!live) return;
    updateTag(live.id, { archivedAt: live.archivedAt ? null : now() });
    closeEditTag();
  }

  const handleOverlay = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const shownError = showErrors ? error : null;

  return (
    <div className={styles.overlay} onClick={handleOverlay}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tag-modal-title">
        <div className={styles.header}>
          <span id="tag-modal-title" className={styles.title}>
            {isEdit ? L.edit : L.new}
            {live?.archivedAt && <span className={styles.badge}>{L.archived}</span>}
          </span>
          <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label={L.close}><CloseIcon /></button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <div className={styles.nameRow}>
              <IconField value={icon} onChange={setIcon} fallback="🏷️" label={L.icon} />
              <input
                className={styles.input}
                placeholder={L.namePlaceholder}
                aria-label={L.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!shownError || undefined}
                aria-describedby={shownError ? 'tag-name-error' : undefined}
                autoFocus
              />
            </div>
            <FieldError id="tag-name-error">{shownError}</FieldError>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{L.colour}</label>
            <ColorPicker value={color} onChange={setColor} palette="light" />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="tag-notes">{L.notes}</label>
            <textarea
              id="tag-notes"
              className={styles.textarea}
              placeholder={L.notesPlaceholder}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {isEdit && <p className={styles.uses}>{L.uses(uses)}</p>}

          <div className={styles.actions}>
            {live && <button type="button" className={styles.cancelBtn} onClick={toggleArchive}>{live.archivedAt ? L.restore : L.archive}</button>}
            <span className={styles.spacer} />
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>{L.cancel}</button>
            <button type="submit" className={styles.submitBtn}>{isEdit ? L.save : L.create}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
