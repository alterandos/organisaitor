import { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useNoteStore } from '@/store/noteStore';
import { useNoteView } from '@/store/noteViews';
import { useTaskStore } from '@/store/taskStore';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { LABELS } from '@/config/labels';
import type { NoteTagId, CollectionId } from '@/types';
import { formatDate } from '@/utils/date';
import styles from './EditNoteMetaModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

const ACCENT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#10b981', '#14b8a6',
  '#3b82f6', '#64748b',
];

// Render a flat list of tags in depth-first tree order with indentation
function buildTagList(
  noteTags: Record<string, import('@/types/notes').NoteTag>,
  parentId: NoteTagId | null,
  depth: number,
): { tag: import('@/types/notes').NoteTag; depth: number }[] {
  return Object.values(noteTags)
    .filter((t) => t.parentTagId === parentId)
    .sort((a, b) => a.order - b.order)
    .flatMap((tag) => [
      { tag, depth },
      ...buildTagList(noteTags, tag.id as NoteTagId, depth + 1),
    ]);
}

export function EditNoteMetaModal() {
  const closeModal       = useUIStore((s) => s.closeModal);
  const editingNoteMetaId = useUIStore((s) => s.editingNoteMetaId);
  const noteTags         = useNoteStore((s) => s.noteTags);
  const updateNote       = useNoteStore((s) => s.updateNote);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const allCollections   = Object.values(collectionsRecord);

  const note = useNoteView(editingNoteMetaId);

  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [color, setColor]   = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [collectionId, setCollectionId] = useState<CollectionId | null>(null);

  useEffect(() => {
    if (note) {
      setSelectedTagIds(new Set(note.tagIds));
      setColor(note.color);
      setPinned(note.pinned);
      setCollectionId(note.collectionId);
    }
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEscapeClose(closeModal);

  if (!note) return null;

  const handleSave = () => {
    updateNote(note.id, {
      tagIds: Array.from(selectedTagIds) as NoteTagId[],
      color,
      pinned,
      collectionId,
    });
    closeModal();
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const areaItems = buildTagList(noteTags as Record<string, import('@/types/notes').NoteTag>, null, 0)
    .filter((i) => i.tag.kind === 'area');
  const tagItems  = Object.values(noteTags)
    .filter((t) => t.kind === 'tag')
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Edit note details</span>
          <button className={styles.closeBtn} onClick={closeModal}>×</button>
        </div>

        <div className={styles.noteTitle}>{note.isEncrypted ? '🔒 ' : ''}{note.title || '(Untitled)'}</div>

        <div className={styles.body}>

          {/* ── Notebooks ─────────────────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Notebooks</div>
            {areaItems.length === 0 ? (
              <div className={styles.emptyHint}>No notebooks yet</div>
            ) : (
              <div className={styles.tagList}>
                {areaItems.map(({ tag, depth }) => (
                  <label key={tag.id} className={styles.tagRow} style={{ paddingLeft: `${0.5 + depth * 1}rem` }}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selectedTagIds.has(tag.id)}
                      onChange={() => toggleTag(tag.id)}
                    />
                    <span className={styles.tagIcon}>{tag.icon || '📁'}</span>
                    <span className={styles.tagName} style={tag.color ? { color: tag.color } : undefined}>
                      {tag.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* ── Annotation tags ───────────────────────────────────────────── */}
          {tagItems.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionLabel}>Tags</div>
              <div className={styles.tagList}>
                {tagItems.map((tag) => (
                  <label key={tag.id} className={styles.tagRow}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selectedTagIds.has(tag.id)}
                      onChange={() => toggleTag(tag.id)}
                    />
                    <span className={styles.tagIcon}>{tag.icon || '🏷️'}</span>
                    <span className={styles.tagName} style={tag.color ? { color: tag.color } : undefined}>
                      {tag.name}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* ── Endeavour ─────────────────────────────────────────────────── */}
          {allCollections.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionLabel}>{LABELS.collection}</div>
              <CollectionPicker
                collections={allCollections}
                value={collectionId}
                onChange={(id) => setCollectionId(id)}
                noneLabel={`No ${LABELS.collection}`}
              />
            </section>
          )}

          {/* ── Accent color ──────────────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Accent colour</div>
            <div className={styles.colorRow}>
              <button
                className={`${styles.colorSwatch} ${color === null ? styles.colorSwatchActive : ''}`}
                style={{ background: 'var(--color-surface-alt)' }}
                onClick={() => setColor(null)}
                title="No colour"
              >—</button>
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`${styles.colorSwatch} ${color === c ? styles.colorSwatchActive : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
            </div>
          </section>

          {/* ── Pinned ────────────────────────────────────────────────────── */}
          <section className={styles.section}>
            <label className={styles.pinnedRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              <span>Pinned (appears in quick-access area)</span>
            </label>
          </section>

          {/* ── Dates ─────────────────────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Dates</div>
            <div className={styles.dateGrid}>
              <span className={styles.dateLabel}>Created</span>
              <span className={styles.dateValue}>{formatDate(note.createdAt)}</span>
              {note.lastViewedAt && (
                <>
                  <span className={styles.dateLabel}>Last viewed</span>
                  <span className={styles.dateValue}>{formatDate(note.lastViewedAt)}</span>
                </>
              )}
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
