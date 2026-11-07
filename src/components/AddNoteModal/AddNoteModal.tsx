import { commitTags } from '@/services/tags';
import { togglePin } from '@/services/quickAccessPins';
import { useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { NOTE_TEMPLATES } from '@/config/noteTemplates';
import { LABELS } from '@/config/labels';
import { resolveNoteInheritedCollectionId, takesNotes } from '@/utils/notes';
import type { NoteTagId } from '@/types';
import styles from './AddNoteModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CreateKindSwitcher } from '@/components/CreateKindSwitcher/CreateKindSwitcher';
import { CloseIcon } from '@/components/Icons';
import { NoteFields, type NoteDraft } from '@/components/NoteFields/NoteFields';

const L = LABELS.noteFields;

// A new note: its title and template, then the same details as its edit form (components/NoteFields,
// "Creating and editing a thing is one form").
export function AddNoteModal() {
  const closeModal = useUIStore((s) => s.closeModal);
  const openNote   = useUIStore((s) => s.openNote);
  const addNote    = useNoteStore((s) => s.addNote);
  const noteTags   = useNoteStore((s) => s.noteTags);

  const [title, setTitle] = useState(() => useUIStore.getState().createDraft ?? '');
  const [templateId, setTemplateId] = useState(NOTE_TEMPLATES[0].id);
  const [draft, setDraft] = useState<NoteDraft>(() => {
    const sel = useUIStore.getState().selectedNoteTagId;
    const tag = sel ? useNoteStore.getState().noteTags[sel] : undefined;
    return { tagIds: tag && takesNotes(tag) ? [sel!] : [], collectionId: null, suiteTagIds: [], color: null, pinned: false };
  });
  const inherited = resolveNoteInheritedCollectionId(draft.tagIds as NoteTagId[], noteTags);

  useEscapeClose(() => { closeModal(); });
  // Creating a note opens it with the cursor in it, ready to type (asked for 2026-10-19); Save &
  // close is the second choice.
  useCtrlEnterSubmit(() => handleSave());

  function handleSave(openEditor = true) {
    if (!title.trim()) return;
    const template = NOTE_TEMPLATES.find((t) => t.id === templateId);
    const noteId = addNote({
      title,
      content: template?.content ? JSON.stringify(template.content) : '',
      tagIds: draft.tagIds as NoteTagId[],
      templateId,
      collectionId: draft.collectionId ?? inherited,
    });
    const madeTags = commitTags(draft.suiteTagIds);
    useNoteStore.getState().updateNote(noteId, { ...(madeTags.length ? { suiteTagIds: madeTags } : {}), ...(draft.color ? { color: draft.color } : {}) });
    if (draft.pinned) togglePin('note', noteId);
    closeModal();
    if (openEditor) {
      useUIStore.getState().setRequestedNoteFocus(noteId);
      openNote(noteId);
    }
  }

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <CreateKindSwitcher current="note" draft={title} />
        <div className={styles.header}>
          <h2>{L.newTitle}</h2>
          <button className={styles.closeBtn} onClick={closeModal} aria-label={L.close}><CloseIcon /></button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label htmlFor="title" className={styles.label}>{L.title}</label>
            <input id="title" autoFocus type="text" value={title} placeholder={L.titlePlaceholder} className={styles.input}
              onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSave(false); }} />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>{L.template}</span>
            <div className={styles.templateGrid}>
              {NOTE_TEMPLATES.map((t) => (
                <button key={t.id} type="button" aria-pressed={templateId === t.id} title={t.description}
                  className={`${styles.templateOption} ${templateId === t.id ? styles.templateOptionSelected : ''}`} onClick={() => setTemplateId(t.id)}>
                  <span className={styles.templateIcon}>{t.icon}</span>
                  <span className={styles.templateName}>{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <NoteFields value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} inheritedCollectionId={inherited} />
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={closeModal}>{L.cancel}</button>
          <button className={styles.btnSecondary} onClick={() => handleSave(false)} disabled={!title.trim()}>{L.saveClose}</button>
          <button className={styles.btnPrimary} onClick={() => handleSave(true)} disabled={!title.trim()}>{L.saveEdit}</button>
        </div>
      </div>
    </div>
  );
}
