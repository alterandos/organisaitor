import { commitTags } from '@/services/tags';
import { useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import type { NoteTagId } from '@/types';
import styles from './EditNoteTagModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { BackdropField } from '@/components/NoteEditor/NoteBackdrop';
import { CloseIcon } from '@/components/Icons';
import { EncryptContentsField } from '@/components/EncryptContentsField/EncryptContentsField';
import { notebookEncryptionSource } from '@/utils/encryptionScopes';
import { isPinnedNotebook } from '@/utils/notes';
import { NoteTagFields, type NoteTagDraft } from '@/components/NoteTagFields/NoteTagFields';

// A notebook's or annotation's edit form: the same fields as a new one (components/NoteTagFields,
// "Creating and editing a thing is one form"), then what applies at once to a saved notebook (keep
// everything in it encrypted, its backdrop).
export function EditNoteTagModal() {
  const closeEditNoteTag = useUIStore((s) => s.closeEditNoteTag);
  const editingNoteTagId = useUIStore((s) => s.editingNoteTagId);
  const noteTags         = useNoteStore((s) => s.noteTags);
  const updateNoteTag    = useNoteStore((s) => s.updateNoteTag);

  const tag = editingNoteTagId ? noteTags[editingNoteTagId as NoteTagId] : null;

  // NotesSection remounts this modal per tag (key), so these initialise from the tag being edited.
  const [draft, setDraft] = useState<NoteTagDraft>(() => ({
    name: tag?.name ?? '', icon: tag?.icon ?? '', color: tag?.color ?? null, parentId: (tag?.parentTagId ?? null) as NoteTagId | null,
    collectionId: tag?.collectionId ?? null, suiteTagIds: tag?.suiteTagIds ?? [], fieldSchema: tag?.fieldSchema ?? [],
  }));

  useEscapeClose(closeEditNoteTag);
  useCtrlEnterSubmit(() => handleSave(), !!tag && !!editingNoteTagId);

  if (!tag || !editingNoteTagId) return null;

  const isAnnotationTag = tag.kind === 'tag';
  const title = LABELS.noteTagFields.editTitle(isAnnotationTag ? LABELS.annotations.one : 'Notebook');

  function handleSave() {
    if (!draft.name.trim() || !tag) return;
    updateNoteTag(editingNoteTagId as NoteTagId, {
      name: draft.name.trim(),
      icon: draft.icon.trim() || null,
      color: draft.color,
      tagTypeId: null,
      fieldSchema: draft.fieldSchema,
      collectionId: isAnnotationTag ? null : draft.collectionId,
      ...(!isAnnotationTag ? { parentTagId: draft.parentId } : {}),
      ...(!isAnnotationTag && (draft.suiteTagIds.length || tag.suiteTagIds) ? { suiteTagIds: commitTags(draft.suiteTagIds) } : {}),
    });
    closeEditNoteTag();
  }

  return (
    <div className={styles.overlay} onClick={closeEditNoteTag}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button className={styles.closeBtn} onClick={closeEditNoteTag} aria-label={LABELS.noteTagFields.close}><CloseIcon /></button>
        </div>

        <div className={styles.body}>
          <NoteTagFields kind={tag.kind} levelLabel={isAnnotationTag ? LABELS.annotations.one : 'Notebook'} selfId={tag.id} onEnter={handleSave}
            value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />

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

        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={closeEditNoteTag}>{LABELS.noteTagFields.cancel}</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={!draft.name.trim()}>{LABELS.noteTagFields.save}</button>
        </div>
      </div>
    </div>
  );
}
