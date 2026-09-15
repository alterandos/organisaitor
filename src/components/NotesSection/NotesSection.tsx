import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { ChronicleView } from '../ChronicleView/ChronicleView';
import { TagView } from './TagView';
import { TagFAB } from './TagFAB';
import { EditNoteTagModal } from '../EditNoteTagModal/EditNoteTagModal';
import styles from './NotesSection.module.css';

export function NotesSection() {
  const noteTagViewActive = useUIStore((s) => s.noteTagViewActive);
  const closeNoteTagView  = useUIStore((s) => s.closeNoteTagView);
  const editNoteTagOpen   = useUIStore((s) => s.editNoteTagOpen);

  // Esc closes tag view
  useEffect(() => {
    if (!noteTagViewActive) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNoteTagView(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [noteTagViewActive, closeNoteTagView]);

  return (
    <div className={styles.container}>
      {noteTagViewActive ? <TagView /> : <ChronicleView />}
      <TagFAB />
      {editNoteTagOpen && <EditNoteTagModal />}
    </div>
  );
}
