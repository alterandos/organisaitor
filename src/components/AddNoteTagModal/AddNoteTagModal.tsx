import { useState, useEffect } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useTaskStore } from '@/store/taskStore';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import { BUILTIN_TAGS } from '../NoteEditor/builtinTags';
import styles from './AddNoteTagModal.module.css';

const PRESET_COLORS = [
  '#5b6ee1', '#2563eb', '#7c3aed', '#db2777',
  '#dc2626', '#ea580c', '#d97706', '#16a34a',
  '#0891b2', '#475569',
];

function getDepth(tagId: string | null, noteTags: Record<string, { parentTagId: string | null }>): number {
  if (!tagId) return 0;
  let depth = 1;
  let current = noteTags[tagId];
  while (current?.parentTagId) {
    depth++;
    current = noteTags[current.parentTagId];
  }
  return depth;
}

const LEVEL_LABELS = ['Notebook', 'Page', 'Sub-page', 'Section'];

export function AddNoteTagModal() {
  const closeModal             = useUIStore((s) => s.closeModal);
  const pendingNoteTagParentId = useUIStore((s) => s.pendingNoteTagParentId);
  const pendingNoteTagKind     = useUIStore((s) => s.pendingNoteTagKind);
  const noteTags               = useNoteStore((s) => s.noteTags);
  const addNoteTag             = useNoteStore((s) => s.addNoteTag);

  const collectionsRecord = useTaskStore((s) => s.collections);
  const allCollections    = Object.values(collectionsRecord);

  const [name, setName]         = useState('');
  const [icon, setIcon]         = useState('');
  const [color, setColor]       = useState<string | null>(null);
  const [typeKey, setTypeKey]   = useState<string>('');

  const isTag     = pendingNoteTagKind === 'tag';
  const parentTag = pendingNoteTagParentId ? noteTags[pendingNoteTagParentId] : null;
  const depth     = getDepth(pendingNoteTagParentId, noteTags);
  const levelLabel = isTag ? 'Tag' : LEVEL_LABELS[Math.min(depth, LEVEL_LABELS.length - 1)];

  const [collectionId, setCollectionId] = useState<CollectionId | null>(parentTag?.collectionId ?? null);

  // Pre-fill icon/color when type is chosen
  const handleTypeChange = (key: string) => {
    setTypeKey(key);
    if (!key) return;
    const builtin = BUILTIN_TAGS.find((t) => t.typeKey === key);
    if (!builtin) return;
    if (!icon) setIcon(builtin.icon);
    if (!color) setColor(builtin.color);
  };

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { closeModal(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleCreate(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    if (!name.trim()) return;
    addNoteTag({
      name: name.trim(),
      kind: pendingNoteTagKind,
      icon: icon.trim() || null,
      color,
      parentTagId: isTag ? null : (pendingNoteTagParentId ?? null),
      tagTypeId: typeKey || null,
      collectionId: isTag ? null : collectionId,
    });
    closeModal();
  };

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>New {levelLabel}</h2>
          <button className={styles.closeBtn} onClick={closeModal}>✕</button>
        </div>

        <div className={styles.body}>
          {!isTag && parentTag && (
            <p className={styles.context}>Inside <strong>{parentTag.name}</strong></p>
          )}

          <div className={styles.field}>
            <label htmlFor="nb-name" className={styles.label}>Name</label>
            <input
              id="nb-name"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder={`${levelLabel} name…`}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="nb-type" className={styles.label}>
              Type <span className={styles.optional}>(optional)</span>
            </label>
            <select
              id="nb-type"
              className={styles.select}
              value={typeKey}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              <option value="">None</option>
              {BUILTIN_TAGS.map((t) => (
                <option key={t.typeKey} value={t.typeKey}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="nb-icon" className={styles.label}>
                Icon <span className={styles.optional}>(emoji)</span>
              </label>
              <input
                id="nb-icon"
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="📓"
                className={`${styles.input} ${styles.iconInput}`}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Color <span className={styles.optional}>(optional)</span>
              </label>
              <div className={styles.swatches}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`${styles.swatch} ${color === c ? styles.swatchActive : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(color === c ? null : c)}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>

          {!isTag && allCollections.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>{LABELS.collection} <span className={styles.optional}>(optional)</span></label>
              <CollectionPicker
                collections={allCollections}
                value={collectionId}
                onChange={(id) => setCollectionId(id)}
                noneLabel={`No ${LABELS.collection}`}
              />
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={closeModal}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleCreate} disabled={!name.trim()}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
