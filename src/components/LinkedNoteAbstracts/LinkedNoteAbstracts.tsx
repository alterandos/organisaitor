import { useState } from 'react';
import { useNoteViews } from '@/store/noteViews';
import { useNoteStore } from '@/store/noteStore';
import { isNoteLocked } from '@/services/noteSecrets';
import { LABELS } from '@/config/labels';
import type { CrossAppRef } from '@/types';
import type { Note, NoteId } from '@/types/notes';
import styles from './LinkedNoteAbstracts.module.css';

interface Props {
  refs:    CrossAppRef[];
  onOpen?: (ref: CrossAppRef) => void;
}

// Under a calendar item's own notes: the abstract of each linked note that has one, editable in
// place (it saves to the note, so the note shows the change too). Kept apart from the item's own
// notes, never merged into them: what the user typed in the item stays the item's, and the
// abstract stays the note's, wherever either is edited. A locked encrypted note shows nothing.
export function LinkedNoteAbstracts({ refs, onOpen }: Props) {
  const notes = useNoteViews();
  const raw = useNoteStore((s) => s.notes);
  const seen = new Set<string>();
  const shown = refs.filter((r) => {
    if (r.type !== 'note' || seen.has(r.id)) return false;
    seen.add(r.id);
    const n = notes[r.id as NoteId];
    const stored = raw[r.id as NoteId];
    return !!n && !!stored && !isNoteLocked(stored) && !!n.abstract?.trim();
  });
  if (shown.length === 0) return null;
  return (
    <div className={styles.list}>
      {shown.map((ref) => <AbstractBox key={ref.id} note={notes[ref.id as NoteId]} onOpen={onOpen ? () => onOpen(ref) : undefined} />)}
    </div>
  );
}

function AbstractBox({ note, onOpen }: { note: Note; onOpen?: () => void }) {
  const L = LABELS.noteAbstracts;
  const [text, setText] = useState(note.abstract ?? '');
  // The note's abstract changed elsewhere (in the note, another device) while this isn't being
  // edited: show the new text.
  const [shownFor, setShownFor] = useState(note.abstract);
  const [editing, setEditing] = useState(false);
  if (!editing && note.abstract !== shownFor) { setShownFor(note.abstract); setText(note.abstract ?? ''); }

  function save() {
    setEditing(false);
    const next = text.trim() ? text : null;
    if (next !== note.abstract) {
      useNoteStore.getState().updateNote(note.id, { abstract: next });
      setShownFor(next);
    }
  }

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        {onOpen
          ? <button type="button" className={styles.noteLink} onClick={onOpen}>📝 {L.heading(note.title || 'Untitled')}</button>
          : <span className={styles.noteLink}>📝 {L.heading(note.title || 'Untitled')}</span>}
      </div>
      <textarea
        className={styles.text}
        value={text}
        placeholder={L.placeholder}
        title={L.hint}
        rows={Math.min(8, Math.max(2, text.split('\n').length))}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
    </div>
  );
}
