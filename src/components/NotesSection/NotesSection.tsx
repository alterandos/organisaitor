import { useUIStore } from '@/store/uiStore';
import { ChronicleView } from '../ChronicleView/ChronicleView';
import { TagView } from './TagView';
import { GlossaryView } from './GlossaryView';
import { ReviewView } from './ReviewView';
import { TagFAB } from './TagFAB';
import { EditNoteTagModal } from '../EditNoteTagModal/EditNoteTagModal';
import styles from './NotesSection.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

export function NotesSection() {
  const noteTagViewActive = useUIStore((s) => s.noteTagViewActive);
  const glossaryOpen      = useUIStore((s) => s.notesGlossaryOpen);
  const reviewOpen        = useUIStore((s) => s.notesReviewOpen);
  const closeNoteTagView  = useUIStore((s) => s.closeNoteTagView);
  const editNoteTagOpen   = useUIStore((s) => s.editNoteTagOpen);
  const editingNoteTagId  = useUIStore((s) => s.editingNoteTagId);

  // Esc closes tag view
  useEscapeClose(closeNoteTagView, noteTagViewActive);

  return (
    <div className={styles.container}>
      {glossaryOpen ? <GlossaryView /> : reviewOpen ? <ReviewView /> : noteTagViewActive ? <TagView /> : <ChronicleView />}
      <TagFAB />
      {editNoteTagOpen && <EditNoteTagModal key={editingNoteTagId} />}
    </div>
  );
}
