import { useUIStore } from '@/store/uiStore';
import { trashedOriginOf, type GlossaryEntry } from '@/services/glossary';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import { restoreFromTrash } from '@/services/trash';
import { LABELS } from '@/config/labels';
import styles from './GlossaryView.module.css';

const L = LABELS.glossary;

// Where a Glossary record came from (2026-11-03): the note it was made in (opened at its card or
// marked text), that note in the Recycling Bin (with Restore), a note deleted for good, or the
// Glossary itself. The note's title in the bin is the one the bin keeps; nothing else is stored.
export function GlossaryOrigin({ entry }: { entry: GlossaryEntry }) {
  if (entry.origin === 'glossary') return <span className={styles.muted}>{L.madeHere}</span>;
  if (entry.origin === 'deleted') return <span className={styles.muted}>{L.fromDeleted}</span>;
  if (entry.origin === 'trashed') {
    const restore = () => {
      const t = entry.noteId ? trashedOriginOf(entry.noteId) : null;
      if (t) restoreFromTrash(t.id);
    };
    return (
      <span className={styles.muted}>
        {L.fromTrashed(entry.noteTitle || L.untitledNote)}{' · '}
        <button type="button" className={styles.link} onClick={restore}>{L.restoreNote}</button>
      </span>
    );
  }
  const open = () => {
    useUIStore.getState().openGlossaryRecord(null);
    if (entry.noteId) openNotePassage(entry.noteId, definitionPassage(entry.id));
  };
  return (
    <button type="button" className={styles.link} title={L.definedAt([...entry.notebookPath, entry.noteTitle || L.untitledNote])} onClick={open}>
      {L.definedIn(entry.noteTitle || L.untitledNote, entry.notebookPath.at(-1))}
    </button>
  );
}
