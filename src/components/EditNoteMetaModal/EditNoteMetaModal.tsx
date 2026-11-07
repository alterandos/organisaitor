import { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { isPinned, togglePin } from '@/services/quickAccessPins';
import { useNoteStore } from '@/store/noteStore';
import { useNoteView } from '@/store/noteViews';
import { LABELS } from '@/config/labels';
import type { NoteTagId } from '@/types';
import type { Note } from '@/types/notes';
import { formatDate } from '@/utils/date';
import styles from './EditNoteMetaModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { BackdropField } from '@/components/NoteEditor/NoteBackdrop';
import { CloseIcon } from '@/components/Icons';
import { resolveNoteInheritedCollectionId } from '@/utils/notes';
import { commitTags } from '@/services/tags';
import { NoteFields, type NoteDraft } from '@/components/NoteFields/NoteFields';

const L = LABELS.noteFields;

// The note can be briefly unavailable (an encrypted note whose plaintext isn't decrypted yet), so
// the form only mounts once it exists, keyed by note, and initialises its state from it.
export function EditNoteMetaModal() {
  const editingNoteMetaId = useUIStore((s) => s.editingNoteMetaId);
  const note = useNoteView(editingNoteMetaId);
  if (!note) return null;
  return <EditNoteMetaForm key={note.id} note={note} />;
}

function EditNoteMetaForm({ note }: { note: Note }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const noteTags   = useNoteStore((s) => s.noteTags);
  const updateNote = useNoteStore((s) => s.updateNote);

  const [draft, setDraft] = useState<NoteDraft>(() => ({
    tagIds: [...note.tagIds], collectionId: note.collectionId, suiteTagIds: note.suiteTagIds ?? [], color: note.color, pinned: isPinned('note', note.id),
  }));
  const inherited = resolveNoteInheritedCollectionId(draft.tagIds as NoteTagId[], noteTags);

  useEscapeClose(closeModal);
  useCtrlEnterSubmit(() => handleSave());

  function handleSave() {
    updateNote(note.id, {
      tagIds: draft.tagIds as NoteTagId[],
      color: draft.color,
      collectionId: draft.collectionId ?? inherited,
      ...(draft.suiteTagIds.length || note.suiteTagIds ? { suiteTagIds: commitTags(draft.suiteTagIds) } : {}),
    });
    if (draft.pinned !== isPinned('note', note.id)) togglePin('note', note.id);
    closeModal();
  }

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{L.editTitle}</span>
          <button className={styles.closeBtn} onClick={closeModal} aria-label={L.close}><CloseIcon /></button>
        </div>

        <div className={styles.noteTitle}>{note.isEncrypted ? '🔒 ' : ''}{note.title || L.untitled}</div>

        <div className={styles.body}>
          <NoteFields value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} inheritedCollectionId={inherited} />

          {/* What needs a saved note: its backdrop (applies at once) and its dates. */}
          <section className={styles.section}>
            <BackdropField note={note} />
          </section>
          <section className={styles.section}>
            <div className={styles.sectionLabel}>{L.dates}</div>
            <div className={styles.dateGrid}>
              <span className={styles.dateLabel}>{L.created}</span>
              <span className={styles.dateValue}>{formatDate(note.createdAt)}</span>
              {note.lastViewedAt && (
                <>
                  <span className={styles.dateLabel}>{L.lastViewed}</span>
                  <span className={styles.dateValue}>{formatDate(note.lastViewedAt)}</span>
                </>
              )}
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={closeModal}>{L.cancel}</button>
          <button className={styles.saveBtn} onClick={handleSave}>{L.save}</button>
        </div>
      </div>
    </div>
  );
}
