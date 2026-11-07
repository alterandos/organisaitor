import { useEffect, useRef } from 'react';
import { useEndeavourScope } from '@/hooks/useEndeavourScope';
import { useTagFilter } from '@/hooks/useTagFilter';
import { noteItem } from '@/utils/tagScope';
import { inEndeavourScope } from '@/utils/endeavourGraph';
import { noteIsEmpty } from '@/utils/emptyContent';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { formatDate } from '@/utils/date';
import { NOTE_TEMPLATES } from '@/config/noteTemplates';
import { getNoteEffectiveCollectionId } from '@/utils/notes';
import { deleteNoteAsked } from '@/services/noteDelete';
import { noteView, isNoteLocked, useSecretsVersion } from '@/services/noteSecrets';
import { TruncatedText } from '@/components/TruncatedText/TruncatedText';
import type { NoteTagId, NoteId, CollectionId } from '@/types';
import type { Note } from '@/types/notes';
import styles from './NoteList.module.css';
import { LABELS } from '@/config/labels';
import './noteRowMenu';
import type { NoteRowMenuData } from './noteRowMenu';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import { useWaitingForEncryption } from '@/hooks/useWaitingForEncryption';
import { EditIcon, IndentIcon, OutdentIcon, TrashIcon } from '@/components/Icons';
import { noteClickProps } from '@/components/NoteSplitView/openBeside';

interface NoteListProps {
  tagId: NoteTagId;
  onAddNote?: () => void;
  hideHeader?: boolean;
}

// ── Single note row ───────────────────────────────────────────────────────

interface NoteRowProps {
  note: Note;
  indent: number;
  siblings: Note[];     // Sorted list of top-level notes (same parent level)
  allNotes: Note[];     // All notes for this tag (for computing children)
}

function NoteRow({ note: rawNote, indent, siblings, allNotes }: NoteRowProps) {
  // Title comes from the decrypted view for an encrypted note (blank in the store). Subscribing
  // to the cache version re-renders the row when the vault locks/unlocks.
  useSecretsVersion((s) => s.version);
  const note = noteView(rawNote);
  const locked = isNoteLocked(rawNote);
  const waiting = useWaitingForEncryption('note', rawNote);
  const openNote         = useUIStore((s) => s.openNote);
  const showEditNoteMeta = useUIStore((s) => s.showEditNoteMeta);
  const editingNoteId    = useUIStore((s) => s.editingNoteId);
  const indentNote       = useNoteStore((s) => s.indentNote);
  const outdentNote      = useNoteStore((s) => s.outdentNote);

  const isActive = editingNoteId === note.id;
  const rowRef = useRef<HTMLDivElement>(null);
  // Same as the notebook tree: a note opened from elsewhere (back/forward, Quick Access, a link)
  // may be far down a long list.
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);
  const myPos    = siblings.findIndex((n) => n.id === note.id);
  const canIndent  = indent === 0 && myPos > 0;
  const canOutdent = note.parentId !== null;

  const children = allNotes.filter((n) => n.parentId === note.id)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const template = note.templateId && note.templateId !== 'blank'
    ? NOTE_TEMPLATES.find((t) => t.id === note.templateId)
    : undefined;

  const deleteNote = async () => {
    await deleteNoteAsked(note.id, `${note.title || 'Untitled'}${locked ? ' (encrypted)' : ''}`, { empty: !locked && noteIsEmpty(note, children.length > 0) });
  };
  const handleDelete = (e: React.MouseEvent) => { e.stopPropagation(); void deleteNote(); };

  // Right-click: a note's menu (`noteRowMenu.ts`), with what only the list can do: indent to the
  // note above, move up a level, delete (asking first).
  useContextMenuScope(rowRef, () => ({
    kind: 'note-row',
    data: {
      noteId: note.id,
      indent: canIndent ? () => indentNote(note.id as NoteId, siblings[myPos - 1].id as NoteId) : undefined,
      outdent: canOutdent ? () => outdentNote(note.id as NoteId) : undefined,
      delete: () => void deleteNote(),
    } satisfies NoteRowMenuData,
  }));

  return (
    <>
      <div
        ref={rowRef}
        className={`${styles.noteItem} ${isActive ? styles.noteItemActive : ''}`}
        style={{ borderLeftColor: note.color ?? '#e5e7eb', paddingLeft: `${4 + indent * 20}px` }}
      >
        {note.isEncrypted && (
          <button
            className={styles.noteLockBtn}
            onClick={(e) => { e.stopPropagation(); useUIStore.getState().requestDecrypt('note', note.id); }}
            title="Encrypted note. Click to decrypt."
            aria-label="Decrypt this note"
          >🔒</button>
        )}
        {waiting && (
          <span className={styles.noteWaiting} title={LABELS.encryptionScope.waitingHint} aria-label={LABELS.encryptionScope.waiting} role="img">🔓</span>
        )}
        <button className={styles.noteMain} {...noteClickProps(note.id, () => openNote(note.id))}>
          <TruncatedText
            text={note.title || '(Untitled)'}
            className={styles.noteTitle}
            reveal="extend"
          />
          <div className={styles.noteTime}>{formatDate(note.updatedAt)}</div>
        </button>
        {template && (
          <span className={styles.noteTypeIcon} title={template.name}>{template.icon}</span>
        )}
        <div className={styles.noteActions}>
          {canIndent && (
            <button
              className={styles.noteActionBtn}
              onClick={(e) => { e.stopPropagation(); indentNote(note.id as NoteId, siblings[myPos - 1].id as NoteId); }}
              title={LABELS.rowActions.indentNote}
            ><IndentIcon /></button>
          )}
          {canOutdent && (
            <button
              className={styles.noteActionBtn}
              onClick={(e) => { e.stopPropagation(); outdentNote(note.id as NoteId); }}
              title="Move up one level"
            ><OutdentIcon /></button>
          )}
          <button
            className={styles.noteActionBtn}
            onClick={(e) => { e.stopPropagation(); showEditNoteMeta(note.id); }}
            title="Edit note details"
          ><EditIcon /></button>
          <button
            className={`${styles.noteActionBtn} ${styles.noteActionDelete}`}
            onClick={handleDelete}
            title="Delete"
          ><TrashIcon width="1em" height="1em" /></button>
        </div>
      </div>

      {children.map((child) => (
        <NoteRow
          key={child.id}
          note={child}
          indent={indent + 1}
          siblings={children}
          allNotes={allNotes}
        />
      ))}
    </>
  );
}

// ── List ──────────────────────────────────────────────────────────────────

export function NoteList({ tagId, onAddNote, hideHeader }: NoteListProps) {
  const getNotesByTag = useNoteStore((s) => s.getNotesByTag);
  const noteTags      = useNoteStore((s) => s.noteTags);
  const activeCollectionId = useUIStore(selectActiveCollectionId) as CollectionId | null;
  const endeavourScope = useEndeavourScope(activeCollectionId);
  const tagFilter = useTagFilter();

  const tag = noteTags[tagId];
  const allTagNotes = getNotesByTag(tagId)
    .filter((n) => inEndeavourScope(endeavourScope, getNoteEffectiveCollectionId(n, noteTags)) && (!tagFilter || tagFilter(noteItem(n, noteTags))));

  // Top-level notes for this tag (no parent, or parent not in this tag's notes)
  const tagNoteIds = new Set(allTagNotes.map((n) => n.id));
  const topLevel = allTagNotes
    .filter((n) => !n.parentId || !tagNoteIds.has(n.parentId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className={styles.noteList}>
      {!hideHeader && (
        <div className={styles.header}>
          <h3 className={styles.title}>{tag?.name ?? 'Notes'}</h3>
          <button className={styles.addBtn} onClick={onAddNote} title="Add note">+</button>
        </div>
      )}

      <div className={styles.notes}>
        {topLevel.length === 0 ? (
          <div className={styles.empty}>{activeCollectionId ? LABELS.noneInCollection('notes') : 'No notes yet'}</div>
        ) : (
          topLevel.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              indent={0}
              siblings={topLevel}
              allNotes={allTagNotes}
            />
          ))
        )}
      </div>
    </div>
  );
}
