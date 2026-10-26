import { useState } from 'react';
import { IconField } from '@/components/IconPicker/IconField';
import { nanoid } from 'nanoid';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useTaskStore } from '@/store/taskStore';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { LABELS } from '@/config/labels';
import { BUILTIN_TAGS } from '../NoteEditor/builtinTags';
import type { NoteTagId, NoteTagFieldDef, NoteTagFieldType, CollectionId } from '@/types';
import styles from './EditNoteTagModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { SWATCH_HEXES, swatchLabel } from '@/config/swatches';
import { BackdropField } from '@/components/NoteEditor/NoteBackdrop';
import { CloseIcon, ColorDotIcon, TrashIcon } from '@/components/Icons';
import { EncryptContentsField } from '@/components/EncryptContentsField/EncryptContentsField';
import { notebookEncryptionSource } from '@/utils/encryptionScopes';
import { isPinnedNotebook } from '@/utils/notes';

const FIELD_TYPES: { value: NoteTagFieldType; label: string }[] = [
  { value: 'text',    label: 'Text'   },
  { value: 'url',     label: 'URL'    },
  { value: 'date',    label: 'Date'   },
  { value: 'number',  label: 'Number' },
  { value: 'rating',  label: 'Rating' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'select',  label: 'Select' },
];

export function EditNoteTagModal() {
  const closeEditNoteTag = useUIStore((s) => s.closeEditNoteTag);
  const editingNoteTagId = useUIStore((s) => s.editingNoteTagId);
  const noteTags         = useNoteStore((s) => s.noteTags);
  const updateNoteTag    = useNoteStore((s) => s.updateNoteTag);

  const collectionsRecord = useTaskStore((s) => s.collections);
  const allCollections    = Object.values(collectionsRecord);

  const tag = editingNoteTagId ? noteTags[editingNoteTagId as NoteTagId] : null;

  // NotesSection remounts this modal per tag (key), so these initialise from the tag being edited.
  const [name, setName]             = useState(() => tag?.name ?? '');
  const [icon, setIcon]             = useState(() => tag?.icon ?? '');
  const [color, setColor]           = useState<string | null>(() => tag?.color ?? null);
  const [typeKey, setTypeKey]       = useState(() => tag?.tagTypeId ?? '');
  const [fieldSchema, setFieldSchema] = useState<NoteTagFieldDef[]>(() => tag?.fieldSchema ?? []);
  const [collectionId, setCollectionId] = useState<CollectionId | null>(() => tag?.collectionId ?? null);

  useEscapeClose(closeEditNoteTag);
  useCtrlEnterSubmit(() => handleSave(), !!tag && !!editingNoteTagId);

  if (!tag || !editingNoteTagId) return null;

  const isAnnotationTag = tag.kind === 'tag';
  const title = isAnnotationTag ? 'Edit Tag' : 'Edit Notebook';

  const addField = () =>
    setFieldSchema((prev) => [...prev, { id: nanoid(8), name: '', type: 'text' }]);

  const updateField = (id: string, changes: Partial<NoteTagFieldDef>) =>
    setFieldSchema((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));

  const removeField = (id: string) =>
    setFieldSchema((prev) => prev.filter((f) => f.id !== id));

  function handleSave() {
    if (!name.trim()) return;
    updateNoteTag(editingNoteTagId as NoteTagId, {
      name: name.trim(),
      icon: icon.trim() || null,
      color,
      tagTypeId: typeKey || null,
      fieldSchema,
      collectionId: isAnnotationTag ? null : collectionId,
    });
    closeEditNoteTag();
  }

  return (
    <div className={styles.overlay} onClick={closeEditNoteTag}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button className={styles.closeBtn} onClick={closeEditNoteTag} aria-label="Close"><CloseIcon /></button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Type <span className={styles.optional}>(optional)</span></label>
            <select
              className={styles.select}
              value={typeKey}
              onChange={(e) => setTypeKey(e.target.value)}
            >
              <option value="">None</option>
              {BUILTIN_TAGS.map((t) => (
                <option key={t.typeKey} value={t.typeKey}>{t.icon} {t.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <span className={styles.label}>{LABELS.iconPicker.label}</span>
              <IconField value={icon || null} onChange={(v) => setIcon(v ?? '')} fallback={isAnnotationTag ? '🏷️' : '📁'} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Color</label>
              <div className={styles.swatches}>
                <button
                  className={`${styles.swatch} ${styles.swatchNone} ${!color ? styles.swatchActive : ''}`}
                  onClick={() => setColor(null)}
                  title="None"
                ><ColorDotIcon color={null} /></button>
                {SWATCH_HEXES.map((c) => (
                  <button
                    key={c}
                    className={`${styles.swatch} ${color === c ? styles.swatchActive : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(color === c ? null : c)}
                    aria-label={swatchLabel(c)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Endeavour (notebooks only) ──────────────────────────────── */}
          {!isAnnotationTag && allCollections.length > 0 && (
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

          {/* ── Encrypt everything in it (notebooks only; applies at once) ── */}
          {!isAnnotationTag && !isPinnedNotebook(tag) && (
            <EncryptContentsField
              label={LABELS.encryptionScope.notebookToggle}
              hint={LABELS.encryptionScope.notebookHint}
              value={!!tag.encryptContents}
              inheritedFrom={tag.encryptContents ? null : notebookEncryptionSource(tag, noteTags)?.name ?? null}
              withFlag={(ctx) => ({ ...ctx, noteTags: { ...ctx.noteTags, [tag.id]: { ...tag, encryptContents: true } } })}
              onChange={(next) => updateNoteTag(tag.id, { encryptContents: next })}
            />
          )}

          {/* ── Backdrop (notebooks only; applies at once) ─────────────── */}
          {!isAnnotationTag && (
            <div className={styles.field}>
              <BackdropField notebook={tag} />
            </div>
          )}

          {/* ── Attribute schema (annotation tags only) ────────────────── */}
          {isAnnotationTag && (
            <>
              <div className={styles.schemaDivider} />
              <div className={styles.schemaHeader}>
                <span className={styles.label}>Attributes</span>
                <button className={styles.addFieldBtn} onClick={addField}>+ Add attribute</button>
              </div>

              {fieldSchema.length === 0 ? (
                <p className={styles.schemaEmpty}>
                  No attributes yet — add fields to capture metadata on tagged notes (e.g. URL, Author, Date).
                </p>
              ) : (
                fieldSchema.map((f) => (
                  <div key={f.id} className={styles.fieldRow}>
                    <input
                      type="text"
                      value={f.name}
                      onChange={(e) => updateField(f.id, { name: e.target.value })}
                      placeholder="Attribute name"
                      className={styles.fieldNameInput}
                    />
                    <select
                      value={f.type}
                      onChange={(e) => updateField(f.id, { type: e.target.value as NoteTagFieldType })}
                      className={styles.fieldTypeSelect}
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft.value} value={ft.value}>{ft.label}</option>
                      ))}
                    </select>
                    <button className={styles.removeFieldBtn} onClick={() => removeField(f.id)} title="Remove"><TrashIcon width="1em" height="1em" /></button>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={closeEditNoteTag}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={!name.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}
