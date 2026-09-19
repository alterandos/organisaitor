import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { getNotebookIcon } from '@/utils/notes';
import type { NoteTagId } from '@/types';
import type { NoteTag } from '@/types/notes';
import styles from './NotebookLocationView.module.css';

interface Props {
  tagId:         NoteTagId;
  noteIds:       string[];            // the notes the list column is showing for this notebook
  visibleTagIds: Set<string> | null;  // Endeavour-filtered notebook ids, or null for no filter
}

// Shown in the editor column when a notebook is selected but no note is open — a small tree of
// where you are: the path down from the root notebook, the current notebook highlighted, and
// its own sub-notebooks and notes below it. Everything in it is clickable, so it doubles as
// another way to move around the tree.
export function NotebookLocationView({ tagId, noteIds, visibleTagIds }: Props) {
  const noteTags = useNoteStore((s) => s.noteTags);
  const notes    = useNoteStore((s) => s.notes);
  const setSelected = useUIStore((s) => s.setSelectedNoteTag);
  const openNote    = useUIStore((s) => s.openNote);

  const current = noteTags[tagId];
  if (!current) return null;

  const path: NoteTag[] = [];
  for (let t: NoteTag | undefined = current; t; t = t.parentTagId ? noteTags[t.parentTagId] : undefined) path.unshift(t);

  const children = Object.values(noteTags)
    .filter((t) => t.parentTagId === tagId && t.kind === 'area' && (!visibleTagIds || visibleTagIds.has(t.id)))
    .sort((a, b) => a.order - b.order);

  const depthOfChildren = path.length;
  const indent = (depth: number) => ({ paddingLeft: `${0.5 + depth * 1.1}rem` });

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.heading}>You are here</div>

        <div className={styles.tree}>
          {path.map((tag, depth) => {
            const isCurrent = tag.id === tagId;
            return (
              <button
                key={tag.id}
                type="button"
                className={`${styles.row} ${isCurrent ? styles.rowCurrent : ''}`}
                style={indent(depth)}
                onClick={() => { if (!isCurrent) setSelected(tag.id as NoteTagId); }}
              >
                {depth > 0 && <span className={styles.branch}>└</span>}
                <span className={styles.icon}>{getNotebookIcon(tag, noteTags, notes)}</span>
                <span className={styles.name}>{tag.name}</span>
                {isCurrent && <span className={styles.marker}>◀ here</span>}
              </button>
            );
          })}

          {children.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`${styles.row} ${styles.rowChild}`}
              style={indent(depthOfChildren)}
              onClick={() => setSelected(tag.id as NoteTagId)}
            >
              <span className={styles.branch}>├</span>
              <span className={styles.icon}>{getNotebookIcon(tag, noteTags, notes)}</span>
              <span className={styles.name}>{tag.name}</span>
            </button>
          ))}

          {noteIds.map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.row} ${styles.rowChild}`}
              style={indent(depthOfChildren)}
              onClick={() => openNote(id)}
            >
              <span className={styles.branch}>├</span>
              <span className={styles.icon}>📄</span>
              <span className={styles.name}>{notes[id as keyof typeof notes]?.title || 'Untitled'}</span>
            </button>
          ))}

          {children.length === 0 && noteIds.length === 0 && (
            <div className={styles.empty} style={indent(depthOfChildren)}>Nothing in this notebook yet.</div>
          )}
        </div>

        <p className={styles.hint}>Click a note to view it here.</p>
      </div>
    </div>
  );
}
