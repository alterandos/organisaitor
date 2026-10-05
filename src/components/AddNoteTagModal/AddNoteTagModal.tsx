import { useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useTaskStore } from '@/store/taskStore';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import type { NoteTag, NoteTagId } from '@/types/notes';
import { BUILTIN_TAGS } from '../NoteEditor/builtinTags';
import styles from './AddNoteTagModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CreateKindSwitcher } from '@/components/CreateKindSwitcher/CreateKindSwitcher';

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

// Every notebook, in tree order, with its depth: the "Inside" picker's list.
function flattenNotebooks(noteTags: Record<string, NoteTag>, parentId: string | null = null, depth = 0): { tag: NoteTag; depth: number }[] {
  return Object.values(noteTags)
    .filter((t) => t.kind === 'area' && t.parentTagId === parentId)
    .sort((a, b) => a.order - b.order)
    .flatMap((t) => [{ tag: t, depth }, ...flattenNotebooks(noteTags, t.id, depth + 1)]);
}

// "University › Biology": where the new notebook will sit.
function notebookPath(id: string, noteTags: Record<string, NoteTag>): string {
  const names: string[] = [];
  for (let t: NoteTag | undefined = noteTags[id]; t; t = t.parentTagId ? noteTags[t.parentTagId] : undefined) names.unshift(t.name);
  return names.join(' › ');
}

export function AddNoteTagModal() {
  const closeModal             = useUIStore((s) => s.closeModal);
  const pendingNoteTagParentId = useUIStore((s) => s.pendingNoteTagParentId);
  const pendingNoteTagKind     = useUIStore((s) => s.pendingNoteTagKind);
  const noteTags               = useNoteStore((s) => s.noteTags);
  const addNoteTag             = useNoteStore((s) => s.addNoteTag);

  const collectionsRecord = useTaskStore((s) => s.collections);
  const allCollections    = Object.values(collectionsRecord);

  const [name, setName]         = useState(() => useUIStore.getState().createDraft ?? '');
  // Starts as wherever the pane was opened from (the selected notebook, or a row's "+"); the
  // "Inside" picker changes it, or clears it for a top-level notebook.
  const [parentId, setParentId] = useState<NoteTagId | null>(pendingNoteTagParentId);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [icon, setIcon]         = useState('');
  const [color, setColor]       = useState<string | null>(null);
  const [typeKey, setTypeKey]   = useState<string>('');

  const isTag     = pendingNoteTagKind === 'tag';
  const parentTag = parentId ? noteTags[parentId] : null;
  const depth     = getDepth(parentId, noteTags);
  const levelLabel = isTag ? 'Tag' : LEVEL_LABELS[Math.min(depth, LEVEL_LABELS.length - 1)];

  // undefined = follow the parent notebook's Endeavour (also after the parent changes); anything
  // else is the user's own pick.
  const [pickedCollectionId, setCollectionId] = useState<CollectionId | null | undefined>(undefined);
  const collectionId = pickedCollectionId !== undefined ? pickedCollectionId : (parentTag?.collectionId ?? null);

  // Pre-fill icon/color when type is chosen
  const handleTypeChange = (key: string) => {
    setTypeKey(key);
    if (!key) return;
    const builtin = BUILTIN_TAGS.find((t) => t.typeKey === key);
    if (!builtin) return;
    if (!icon) setIcon(builtin.icon);
    if (!color) setColor(builtin.color);
  };

  useEscapeClose(() => { closeModal(); });

  function handleCreate() {
    if (!name.trim()) return;
    addNoteTag({
      name: name.trim(),
      kind: pendingNoteTagKind,
      icon: icon.trim() || null,
      color,
      parentTagId: isTag ? null : parentId,
      tagTypeId: typeKey || null,
      collectionId: isTag ? null : collectionId,
    });
    closeModal();
  }

  useCtrlEnterSubmit(() => handleCreate());

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <CreateKindSwitcher current={isTag ? 'note-tag' : 'notebook'} draft={name} />
        <div className={styles.header}>
          <h2>New {levelLabel}</h2>
          <button className={styles.closeBtn} onClick={closeModal}>✕</button>
        </div>

        <div className={styles.body}>
          {!isTag && (
            <div
              className={styles.field}
              onKeyDown={(e) => { if (e.key === 'Escape' && parentPickerOpen) { e.stopPropagation(); setParentPickerOpen(false); } }}
            >
              <span className={styles.label}>{LABELS.notebookParent.label}</span>
              <div className={styles.parentRow}>
                <button
                  type="button"
                  className={styles.parentBtn}
                  onClick={() => setParentPickerOpen((o) => !o)}
                  title={LABELS.notebookParent.change}
                  aria-expanded={parentPickerOpen}
                >
                  <span className={styles.parentName}>{parentId ? notebookPath(parentId, noteTags) : LABELS.notebookParent.topLevel}</span>
                  <span aria-hidden="true">▾</span>
                </button>
                {parentId && (
                  <button
                    type="button"
                    className={styles.parentClear}
                    onClick={() => { setParentId(null); setParentPickerOpen(false); }}
                    title={LABELS.notebookParent.makeTopLevel}
                    aria-label={LABELS.notebookParent.makeTopLevel}
                  >✕</button>
                )}
              </div>
              {parentPickerOpen && (
                <div className={styles.parentList}>
                  <button
                    type="button"
                    className={`${styles.parentOption} ${parentId === null ? styles.parentOptionActive : ''}`}
                    onClick={() => { setParentId(null); setParentPickerOpen(false); }}
                  >{LABELS.notebookParent.topLevel}</button>
                  {flattenNotebooks(noteTags).map(({ tag, depth: d }) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`${styles.parentOption} ${parentId === tag.id ? styles.parentOptionActive : ''}`}
                      style={{ paddingLeft: `${0.6 + d}rem` }}
                      onClick={() => { setParentId(tag.id as NoteTagId); setParentPickerOpen(false); }}
                    >
                      <span className={styles.parentOptionIcon}>{tag.icon ?? '📁'}</span>
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
