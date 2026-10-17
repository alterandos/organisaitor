import { NoteEditor } from '@/components/NoteEditor/NoteEditor';
import { NoteSplitView } from '@/components/NoteSplitView/NoteSplitView';
import { LABELS } from '@/config/labels';
import { notesNav } from '@/services/notesNav';
import { withViewTransition } from '@/utils/viewTransition';
import type { NotesBrowseView } from '@/hooks/useNotesBrowse';
import type { NoteGroup } from '@/utils/notesBrowse';
import styles from './NoteViews.module.css';

// The deepest level of a Notes view (the Mosaic, the Map): the open note in the editor (or the
// notes side by side), with a strip of the notes of the group it was opened from (click one to go
// to it) and the way back out to the view. Shared, so every view opens a note the same way.

export function NoteLevel({ browse, here, backTo }: { browse: NotesBrowseView; here: NoteGroup | null; backTo: string }) {
  const L = LABELS.notesViews;
  const siblings = (here ? here.noteIds : browse.loose).filter((id) => browse.notes[id]);
  const hereNotebook = here?.grouping === 'notebook' ? here.sourceId : null;
  const back = () => withViewTransition('zoom-out', () => notesNav.closeNote());
  return (
    <div className={styles.noteLevel}>
      <div className={styles.strip}>
        <button type="button" className={styles.backBtn} onClick={back}>← {L.back(backTo)}</button>
        {siblings.length > 1 && (
          <nav className={styles.siblings} aria-label={L.siblings}>
            {siblings.map((id) => (
              <button key={id} type="button" className={styles.sibling} aria-current={id === browse.openNoteId ? 'page' : undefined}
                onClick={() => id !== browse.openNoteId && notesNav.openNote(id)}>
                {browse.nameOf(id, hereNotebook).full}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className={styles.editorArea}>
        {browse.split ? <NoteSplitView onNavReturn={back} /> : <NoteEditor onNavReturn={back} />}
      </div>
    </div>
  );
}
