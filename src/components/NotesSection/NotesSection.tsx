import { StickyNotes } from '@/components/StickyNotes/StickyNotes';
import { Suspense } from 'react';
import { useUIStore } from '@/store/uiStore';
import { DEFAULT_NOTES_VIEW, NOTE_VIEWS } from '@/config/noteViews';
import { usePlatform } from '@/hooks/usePlatform';
import { NOTE_VIEW_COMPONENTS } from './noteViewComponents';
import { TagFAB } from './TagFAB';
import { EditNoteTagModal } from '../EditNoteTagModal/EditNoteTagModal';
import styles from './NotesSection.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

// The Notes section shows one view or tool at a time (uiStore.notesView; the list is
// config/noteViews.ts, what each renders noteViewComponents.ts). Never pick what to show here by
// hand: a new view is an entry in those two files.
export function NotesSection() {
  const { isAndroid } = usePlatform();
  const editingNoteId     = useUIStore((s) => s.editingNoteId);
  const notesView         = useUIStore((s) => s.notesView);
  const closeNoteTagView  = useUIStore((s) => s.closeNoteTagView);
  const editNoteTagOpen   = useUIStore((s) => s.editNoteTagOpen);
  const editingNoteTagId  = useUIStore((s) => s.editingNoteTagId);

  // Esc closes tag view
  useEscapeClose(closeNoteTagView, notesView === 'tagView');

  const shown = isAndroid && NOTE_VIEWS[notesView].desktopOnly ? DEFAULT_NOTES_VIEW : notesView;
  const def = NOTE_VIEW_COMPONENTS[shown];
  const View = isAndroid && def.Phone ? def.Phone : def.Component;

  return (
    <div className={styles.container}>
      {def.lazy ? <Suspense fallback={null}><View /></Suspense> : <View />}
      {!(isAndroid && editingNoteId) && <TagFAB />}
      {!isAndroid && <StickyNotes />}
      {editNoteTagOpen && <EditNoteTagModal key={editingNoteTagId} />}
    </div>
  );
}
