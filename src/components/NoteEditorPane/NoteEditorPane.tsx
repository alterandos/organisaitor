import { useState, useRef } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useNoteView } from '@/store/noteViews';
import { isNoteLocked } from '@/services/noteSecrets';
import type { NoteId } from '@/types';
import styles from './NoteEditorPane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

export function NoteEditorPane() {
  const editingNoteId = useUIStore((s) => s.editingNoteId);
  const closeNote = useUIStore((s) => s.closeNote);

  const notes = useNoteStore((s) => s.notes);
  const updateNote = useNoteStore((s) => s.updateNote);

  const rawNote = editingNoteId ? notes[editingNoteId as NoteId] : null;
  // A view, not the raw record — an encrypted note's title/content are blank in the store.
  const note = useNoteView(editingNoteId);
  const locked = !!rawNote && isNoteLocked(rawNote);

  const [title, setTitle] = useState(() => note?.title ?? '');
  const [content, setContent] = useState(() => note?.content ?? '');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-read the note's text when a different note opens, or when it (un)locks — an encrypted note's
  // plaintext arrives after the vault decrypts it (adjusts state during render, not in an effect).
  const syncKey = note ? `${note.id}:${locked}` : null;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    }
  }

  const doSave = () => {
    if (!editingNoteId) return;
    updateNote(editingNoteId as NoteId, {
      title: title.trim(),
      content,
    });
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(doSave, 2000);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(doSave, 2000);
  };

  const handleBlur = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    doSave();
  };

  useEscapeClose(closeNote);

  if (!note || !editingNoteId) return null;

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={handleBlur}
          placeholder="Untitled note"
          className={styles.titleInput}
          disabled={locked}
        />
        {note.isEncrypted && <span title={locked ? 'Encrypted — locked on this device' : 'Encrypted note'}>🔒</span>}
        <button
          className={styles.closeBtn}
          onClick={closeNote}
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      <textarea
        value={content}
        onChange={handleContentChange}
        onBlur={handleBlur}
        placeholder={locked ? 'This note is encrypted and locked — unlock it from Account.' : 'Start typing...'}
        className={styles.editor}
        disabled={locked}
      />

      <div className={styles.footer}>
        <div className={styles.info}>
          {/* TODO: Show tag chips and last saved time in Phase 2 */}
        </div>
      </div>
    </div>
  );
}
