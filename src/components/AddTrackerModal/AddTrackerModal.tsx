import { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { TRACKER_TEMPLATES } from '@/config/trackerTemplates';
import { LABELS } from '@/config/labels';
import type { TrackerTemplate, PurposeId, TagId, CollectionId } from '@/types';
import styles from './AddTrackerModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

const TEMPLATES: TrackerTemplate[] = ['habit', 'books', 'movies', 'custom'];

export function AddTrackerModal() {
  const addCollection      = useTaskStore((s) => s.addCollection);
  const purposes           = useTaskStore((s) => s.purposes);
  const tags               = useTaskStore((s) => s.tags);
  const collectionsRecord  = useTaskStore((s) => s.collections);
  const setActiveTracker   = useUIStore((s) => s.setActiveTracker);
  const closeModal         = useUIStore((s) => s.closeModal);
  const activeCollectionId = useUIStore(selectActiveCollectionId);

  const [name,        setName]       = useState('');
  const [template,    setTemplate]   = useState<TrackerTemplate>('habit');
  const [color,       setColor]      = useState<string | null>(null);
  const [purposeIds,  setPurposeIds] = useState<PurposeId[]>([]);
  const [tagIds,      setTagIds]     = useState<TagId[]>([]);
  const [collectionId, setCollectionId] = useState<CollectionId | null>(activeCollectionId as CollectionId | null);
  const formRef = useRef<HTMLFormElement>(null);

  const purposeList   = Object.values(purposes).filter((p) => !p.archivedAt);
  const tagList       = Object.values(tags);
  const allCollections = Object.values(collectionsRecord);

  useEscapeClose(() => { closeModal(); });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    addCollection({
      kind:        'tracker',
      name:        trimmed,
      color,
      purposeIds,
      tagIds,
      fieldSchema: TRACKER_TEMPLATES[template].fields,
      template,
      collectionId,
    });

    // Select newly created tracker
    const created = Object.values(useTaskStore.getState().collections).find(
      (c) => c.kind === 'tracker' && c.name === trimmed
    );
    if (created) setActiveTracker(created.id);

    closeModal();
  }

  return (
    <div className={styles.overlay} onMouseDown={closeModal}>
      <div
        className={styles.modal}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New tracker"
      >
        <div className={styles.header}>
          <span className={styles.title}>New tracker</span>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit}>
          {/* Name */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="atm-name">Name</label>
            <input
              id="atm-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tracker name"
              required
              autoFocus
            />
          </div>

          {/* Template */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Template</span>
            <div className={styles.templateGrid}>
              {TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.templateCard} ${template === t ? styles.templateCardActive : ''}`}
                  onClick={() => setTemplate(t)}
                >
                  <span className={styles.templateLabel}>{TRACKER_TEMPLATES[t].label}</span>
                  <span className={styles.templateDesc}>{TRACKER_TEMPLATES[t].description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Field preview */}
          {TRACKER_TEMPLATES[template].fields.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Fields (customisable after creation)</span>
              <div className={styles.fieldPreview}>
                {TRACKER_TEMPLATES[template].fields.map((f) => (
                  <span key={f.id} className={styles.fieldChip}>
                    {f.name}
                    <span className={styles.fieldType}>{f.type}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Color */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Color</span>
            <ColorPicker palette="standard" value={color} onChange={setColor} />
          </div>

          {/* Endeavour */}
          {allCollections.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{LABELS.collection}</span>
              <CollectionPicker
                collections={allCollections}
                value={collectionId}
                onChange={setCollectionId}
                noneLabel={`No ${LABELS.collection}`}
              />
            </div>
          )}

          {/* Purposes */}
          {purposeList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Purposes</span>
              <div className={styles.chips}>
                {purposeList.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.chip} ${purposeIds.includes(p.id as PurposeId) ? styles.chipSelected : ''}`}
                    onClick={() => setPurposeIds((prev) =>
                      prev.includes(p.id as PurposeId)
                        ? prev.filter((x) => x !== p.id)
                        : [...prev, p.id as PurposeId]
                    )}
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
              <span className={styles.fieldLabel}>Tags</span>
              <div className={styles.chips}>
                {tagList.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.chip} ${tagIds.includes(t.id as TagId) ? styles.chipSelected : ''}`}
                    style={t.color ? { '--chip-c': t.color } as React.CSSProperties : undefined}
                    onClick={() => setTagIds((prev) =>
                      prev.includes(t.id as TagId)
                        ? prev.filter((x) => x !== t.id)
                        : [...prev, t.id as TagId]
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={!name.trim()}>Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}
