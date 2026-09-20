import { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { LABELS } from '@/config/labels';
import { computeMilestones } from '@/utils/milestones';
import { formatDate, now } from '@/utils/date';
import type { CollectionId, CollectionKind, PurposeId } from '@/types';
import styles from './AddCollectionModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

export function AddCollectionModal() {
  const addCollection    = useTaskStore((s) => s.addCollection);
  const updateCollection = useTaskStore((s) => s.updateCollection);
  const purposes         = useTaskStore((s) => s.purposes);
  const tasksRecord      = useTaskStore((s) => s.tasks);

  const openModal         = useUIStore((s) => s.openModal);
  const editingCollection = useUIStore((s) => s.editingCollection);
  const closeModal        = useUIStore((s) => s.closeModal);
  const closeEditCollection = useUIStore((s) => s.closeEditCollection);

  const isEditMode = editingCollection !== null;
  const isVisible  = isEditMode || openModal === 'add-collection';

  // ── Form state ──────────────────────────────────────────────────────────────
  const [kind, setKind]               = useState<CollectionKind>('project');
  const [name, setName]               = useState(() => editingCollection?.name ?? '');
  const [description, setDescription] = useState(() => editingCollection?.description ?? '');
  const [color, setColor]             = useState<string | null>(() => editingCollection?.color ?? null);
  const [deadline, setDeadline]       = useState(() => editingCollection?.deadline ?? '');
  const [selectedPurposeIds, setSelectedPurposeIds] = useState<PurposeId[]>([]);

  const formRef = useRef<HTMLFormElement>(null);

  useEscapeClose(() => { if (isEditMode) closeEditCollection(); else closeModal(); }, isVisible);

  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isVisible, isEditMode, closeEditCollection, closeModal]);

  if (!isVisible) return null;

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleClose() {
    if (isEditMode) closeEditCollection();
    else closeModal();
  }

  function togglePurpose(id: PurposeId) {
    setSelectedPurposeIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function handleToggleArchive() {
    if (!editingCollection) return;
    updateCollection(editingCollection.id, {
      archivedAt: editingCollection.archivedAt ? null : now(),
    });
    closeEditCollection();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (isEditMode) {
      updateCollection(editingCollection.id, {
        name:        trimmedName,
        description: description.trim() || null,
        color,
        deadline:    deadline || null,
      });
      closeEditCollection();
    } else {
      addCollection({
        kind,
        name:        trimmedName,
        description: description.trim() || null,
        color,
        purposeIds:  selectedPurposeIds,
        deadline:    deadline || null,
      });
      closeModal();
    }
  }

  const purposeList = Object.values(purposes).filter((p) => !p.archivedAt);
  const title = isEditMode ? `Edit ${LABELS.collection}` : `New ${LABELS.collection}`;

  // Show current kind — for edit mode use the stored kind
  const currentKind = isEditMode ? editingCollection.kind : kind;

  // Milestones preview (edit mode only, project kind)
  const milestones = isEditMode && currentKind === 'project'
    ? computeMilestones(editingCollection.id as CollectionId, tasksRecord)
    : [];

  return (
    <div className={styles.overlay} onMouseDown={handleClose}>
      <div
        className={styles.modal}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>
            {title}
            {isEditMode && editingCollection.archivedAt && (
              <span className={styles.archivedBadge}>Archived</span>
            )}
          </span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit}>
          {/* Kind selector — create mode only */}
          {!isEditMode && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Type</span>
              <div className={styles.kindSelector}>
                <button
                  type="button"
                  className={`${styles.kindBtn} ${kind === 'project' ? styles.kindBtnActive : ''}`}
                  onClick={() => setKind('project')}
                >
                  {LABELS.collectionKind.project}
                </button>
                <button
                  type="button"
                  className={`${styles.kindBtn} ${kind === 'list' ? styles.kindBtnActive : ''}`}
                  onClick={() => setKind('list')}
                >
                  {LABELS.collectionKind.list}
                </button>
              </div>
            </div>
          )}

          {/* Name */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="acm-name">
              Name
            </label>
            <input
              id="acm-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${LABELS.collection} name`}
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="acm-description">
              Description
            </label>
            <textarea
              id="acm-description"
              className={styles.textarea}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          {/* Color */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Color</span>
            <ColorPicker palette="standard" value={color} onChange={setColor} />
          </div>

          {/* Deadline — projects only */}
          {currentKind === 'project' && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="acm-deadline">
                Due date
              </label>
              <input
                id="acm-deadline"
                className={styles.input}
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          )}

          {/* Purposes — create mode only */}
          {!isEditMode && purposeList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Purposes</span>
              <div className={styles.chips}>
                {purposeList.map((purpose) => (
                  <button
                    key={purpose.id}
                    type="button"
                    className={`${styles.chip} ${
                      selectedPurposeIds.includes(purpose.id as PurposeId)
                        ? styles.chipSelected
                        : ''
                    }`}
                    onClick={() => togglePurpose(purpose.id as PurposeId)}
                  >
                    {purpose.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Milestones preview — edit mode, projects with tasks */}
          {milestones.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Milestones</span>
              <ul className={styles.milestoneList}>
                {milestones.map((m) => (
                  <li key={m.id} className={styles.milestone}>
                    <span className={styles.milestoneDate}>{formatDate(m.date)}</span>
                    <span className={styles.milestoneTitle}>{m.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            {isEditMode && (
              <button type="button" className={styles.archiveBtn} onClick={handleToggleArchive}>
                {editingCollection.archivedAt ? 'Restore' : 'Archive'}
              </button>
            )}
            <span className={styles.actionsSpacer} />
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={!name.trim()}>
              {isEditMode ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
