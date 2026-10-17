import type { CSSProperties } from 'react';
import { LABELS } from '@/config/labels';
import { getNoteTabTexts } from '@/utils/noteSearchText';
import type { Note } from '@/types/notes';
import type { NoteName } from '@/utils/notes';
import styles from './Mosaic.module.css';

// A note in the Mosaic: its title, the start of its text, when it changed, and its colour.
// Click or Enter opens it (the deepest zoom).

const SNIPPET = 140;

export function MosaicNoteCard({ note, name, subCount, onOpen }: { note: Note; name: NoteName; subCount: number; onOpen: () => void }) {
  const L = LABELS.notesViews;
  const text = getNoteTabTexts(note)[0]?.text.trim() ?? '';
  const changed = new Date(note.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <button
      type="button"
      data-view-tile=""
      className={`${styles.tile} ${styles.noteCard}`}
      style={note.color ? ({ '--tile-accent': note.color } as CSSProperties) : undefined}
      aria-label={L.openNote(name.full)}
      title={name.path || undefined}
      onClick={onOpen}
    >
      <span className={styles.noteTitle}>{name.title}</span>
      {name.notebook && <span className={styles.noteNotebook}>{name.notebook}</span>}
      {text && <span className={styles.noteSnippet}>{text.length > SNIPPET ? `${text.slice(0, SNIPPET)}…` : text}</span>}
      <span className={styles.noteMeta}>
        {changed}
        {subCount > 0 && <> · {L.subNotes(subCount)}</>}
      </span>
    </button>
  );
}
