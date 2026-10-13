import { lazy, Suspense } from 'react';
import { useUIStore } from '@/store/uiStore';
import { ChronicleView } from '../ChronicleView/ChronicleView';
import { MobileNotes } from '../MobileNotes/MobileNotes';
import { usePlatform } from '@/hooks/usePlatform';
import { TagView } from './TagView';
import { GlossaryView } from './GlossaryView';
import { ReviewView } from './ReviewView';
import { HubsView } from './HubsView';
import { TagFAB } from './TagFAB';

// The Map carries React Flow and dagre: its own chunk, loaded the first time it's opened.
const MapView = lazy(() => import('./MapView'));
import { EditNoteTagModal } from '../EditNoteTagModal/EditNoteTagModal';
import styles from './NotesSection.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

export function NotesSection() {
  const { isAndroid } = usePlatform();
  const editingNoteId     = useUIStore((s) => s.editingNoteId);
  const noteTagViewActive = useUIStore((s) => s.noteTagViewActive);
  const glossaryOpen      = useUIStore((s) => s.notesGlossaryOpen);
  const reviewOpen        = useUIStore((s) => s.notesReviewOpen);
  const hubsOpen          = useUIStore((s) => s.notesHubsOpen);
  const mapOpen           = useUIStore((s) => s.notesMapOpen);
  const closeNoteTagView  = useUIStore((s) => s.closeNoteTagView);
  const editNoteTagOpen   = useUIStore((s) => s.editNoteTagOpen);
  const editingNoteTagId  = useUIStore((s) => s.editingNoteTagId);

  // Esc closes tag view
  useEscapeClose(closeNoteTagView, noteTagViewActive);

  return (
    <div className={styles.container}>
      {glossaryOpen ? <GlossaryView /> : reviewOpen ? <ReviewView /> : hubsOpen ? <HubsView /> : mapOpen ? <Suspense fallback={null}><MapView /></Suspense> : noteTagViewActive ? <TagView /> : isAndroid ? <MobileNotes /> : <ChronicleView />}
      {!(isAndroid && editingNoteId) && <TagFAB />}
      {editNoteTagOpen && <EditNoteTagModal key={editingNoteTagId} />}
    </div>
  );
}
