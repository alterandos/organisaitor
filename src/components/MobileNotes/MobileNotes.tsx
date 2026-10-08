import { useEffect, useMemo, useRef, useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useNoteViews } from '@/store/noteViews';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { getVisibleNoteTagIds, getNoteEffectiveCollectionId, getNotebookIcon } from '@/utils/notes';
import { formatRelativeTime } from '@/utils/date';
import { isNoteLocked } from '@/services/noteSecrets';
import { deleteNoteWithCleanup } from '@/services/crossAppLinkCleanup';
import { useLongPress } from '@/hooks/useLongPress';
import { ActionSheet } from '@/components/ActionSheet/ActionSheet';
import type { ActionSheetItem } from '@/components/ActionSheet/ActionSheet';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { NoteEditor } from '@/components/NoteEditor/NoteEditor';
import { PlaceCard, PlaceCardBadge } from '@/components/HistoryBrowser/PlaceCard';
import { describePlace } from '@/components/HistoryBrowser/describePlace';
import { LABELS } from '@/config/labels';
import type { CollectionId, NoteTagId } from '@/types';
import type { Note, NoteTag } from '@/types/notes';
import styles from './MobileNotes.module.css';
import { DisclosureIcon } from '@/components/Icons';

// Notes on a phone (docs/android/10-gap-analysis.md F24, the user's design 2026-10-08/09).
// With no note open, Notes is a home screen: the notebook tree (notes listed inside their
// notebooks) or the recently viewed notes as cards, toggled at the top and remembered
// (uiStore.mobileNotesHome). Opening a note gives it the whole screen between the app's top and
// bottom bars (NoteEditor's phone heading and side panel); Back returns here. Desktop uses
// ChronicleView; this replaces it only on Android (NotesSection).

const RECENT_LIMIT = 30;

export function MobileNotes() {
  const editingNoteId = useUIStore((s) => s.editingNoteId);

  // Back (the hardware button, after any overlay) closes the note: the home screen is where it
  // returns, not the previous stop in history.
  useEffect(() => {
    if (!editingNoteId) return;
    const ui = useUIStore.getState();
    ui.registerMobileBackConsumer(() => { useUIStore.getState().closeNote(); return true; });
    return () => useUIStore.getState().registerMobileBackConsumer(null);
  }, [editingNoteId]);

  return editingNoteId
    ? <div className={styles.noteScreen}><NoteEditor /></div>
    : <MobileNotesHome />;
}

function MobileNotesHome() {
  const home    = useUIStore((s) => s.mobileNotesHome);
  const setHome = useUIStore((s) => s.setMobileNotesHome);

  return (
    <div className={styles.home}>
      <div className={styles.homeBar}>
        <div className={styles.toggle} role="group" aria-label={LABELS.mobileNotes.homeLabel}>
          {(['notebooks', 'recent'] as const).map((h) => (
            <button
              key={h}
              type="button"
              className={`${styles.toggleBtn} ${home === h ? styles.toggleBtnOn : ''}`}
              aria-pressed={home === h}
              onClick={() => setHome(h)}
            >{LABELS.mobileNotes[h]}</button>
          ))}
        </div>
        {home === 'notebooks' && (
          <button type="button" className={styles.newBtn} onClick={() => useUIStore.getState().showAddNoteTag(null)}>
            + {LABELS.mobileNotes.newNotebook}
          </button>
        )}
      </div>
      <div className={styles.homeBody}>
        {home === 'notebooks' ? <NotebookTree /> : <RecentNotes />}
      </div>
    </div>
  );
}

// ── Notebooks: the tree, with each notebook's notes inside it ────────────────

function useEndeavourFilter() {
  const noteTags = useNoteStore((s) => s.noteTags);
  const activeCollectionId = useUIStore(selectActiveCollectionId) as CollectionId | null;
  const visibleTagIds = useMemo(
    () => (activeCollectionId ? getVisibleNoteTagIds(noteTags, activeCollectionId) : null),
    [noteTags, activeCollectionId],
  );
  return { activeCollectionId, visibleTagIds };
}

function childNotebooks(noteTags: Record<string, NoteTag>, parentId: string | null, visible: Set<string> | null) {
  return Object.values(noteTags)
    .filter((t) => t.parentTagId === parentId && t.kind === 'area' && (!visible || visible.has(t.id)))
    .sort((a, b) => a.order - b.order);
}

function NotebookTree() {
  const noteTags = useNoteStore((s) => s.noteTags);
  const { visibleTagIds } = useEndeavourFilter();
  const roots = childNotebooks(noteTags, null, visibleTagIds);

  if (roots.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{visibleTagIds ? `${LABELS.noneInCollection('notebooks')}.` : LABELS.mobileNotes.noNotebooks}</p>
        <button type="button" className={styles.emptyBtn} onClick={() => useUIStore.getState().showAddNoteTag(null)}>
          + {LABELS.mobileNotes.newNotebook}
        </button>
      </div>
    );
  }
  return <div className={styles.tree} role="tree">{roots.map((t) => <NotebookRow key={t.id} tag={t} depth={0} />)}</div>;
}

function NotebookRow({ tag, depth }: { tag: NoteTag; depth: number }) {
  const noteTags   = useNoteStore((s) => s.noteTags);
  const notes      = useNoteStore((s) => s.notes);
  const views      = useNoteViews();
  const expanded   = useUIStore((s) => s.expandedNoteTagIds.includes(tag.id as NoteTagId));
  const selected   = useUIStore((s) => s.selectedNoteTagId === tag.id);
  const { activeCollectionId, visibleTagIds } = useEndeavourFilter();
  const rowRef = useRef<HTMLButtonElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  useLongPress(rowRef, () => setSheetOpen(true));

  const children = childNotebooks(noteTags, tag.id, visibleTagIds);
  const topNotes = Object.values(notes)
    .filter((n) => n.tagIds.includes(tag.id) && !n.archivedAt && !n.parentId)
    .filter((n) => !activeCollectionId || getNoteEffectiveCollectionId(n, noteTags) === activeCollectionId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const count = Object.values(notes).filter((n) => n.tagIds.includes(tag.id) && !n.archivedAt).length;

  const toggle = () => {
    const ui = useUIStore.getState();
    ui.setSelectedNoteTag(tag.id as NoteTagId);
    ui.toggleNoteTagExpanded(tag.id as NoteTagId);
  };

  const L = LABELS.mobileNotes;
  const actions: ActionSheetItem[] = [
    { label: L.newNote, icon: '📝', onSelect: () => { const ui = useUIStore.getState(); ui.setSelectedNoteTag(tag.id as NoteTagId); ui.showAddNote(); } },
    { label: L.newSubNotebook, icon: '📁', onSelect: () => useUIStore.getState().showAddNoteTag(tag.id as NoteTagId) },
    { label: L.editNotebook, icon: '✎', onSelect: () => useUIStore.getState().openEditNoteTag(tag.id) },
    {
      label: LABELS.rowActions.delete, icon: '×', destructive: true,
      onSelect: async () => {
        if (!(await confirmDelete('notebook', tag.name, 'All its contents will be deleted too.'))) return;
        useNoteStore.getState().deleteNoteTag(tag.id as NoteTagId);
        if (useUIStore.getState().selectedNoteTagId === tag.id) useUIStore.getState().setSelectedNoteTag(null);
      },
    },
  ];

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <button
        ref={rowRef}
        type="button"
        className={`${styles.row} ${selected ? styles.rowSelected : ''}`}
        style={{ paddingLeft: `${12 + depth * 18}px` }}
        onClick={toggle}
      >
        <span className={styles.chevron} aria-hidden="true"><DisclosureIcon open={expanded} /></span>
        <span className={styles.rowIcon} aria-hidden="true">{getNotebookIcon(tag, noteTags, notes)}</span>
        <span className={styles.rowName} style={tag.color && selected ? { color: tag.color } : undefined}>{tag.name}</span>
        {count > 0 && <span className={styles.count}>{count}</span>}
      </button>
      {expanded && (
        <div role="group">
          {children.map((c) => <NotebookRow key={c.id} tag={c} depth={depth + 1} />)}
          {topNotes.map((n) => <NoteRow key={n.id} note={views[n.id] ?? n} raw={n} depth={depth + 1} />)}
          {children.length === 0 && topNotes.length === 0 && (
            <div className={styles.rowEmpty} style={{ paddingLeft: `${40 + (depth + 1) * 18}px` }}>{L.emptyNotebook}</div>
          )}
        </div>
      )}
      {sheetOpen && <ActionSheet title={tag.name} items={actions} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

function NoteRow({ note, raw, depth }: { note: Note; raw: Note; depth: number }) {
  const notes = useNoteStore((s) => s.notes);
  const views = useNoteViews();
  const rowRef = useRef<HTMLButtonElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  useLongPress(rowRef, () => setSheetOpen(true));

  const locked = isNoteLocked(raw);
  const title = locked ? `🔒 ${LABELS.mobileNotes.lockedNote}` : (note.title || LABELS.mobileNotes.untitled);
  const subNotes = Object.values(notes)
    .filter((n) => n.parentId === note.id && !n.archivedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const L = LABELS.mobileNotes;
  const actions: ActionSheetItem[] = [
    { label: L.openNote, icon: '📝', onSelect: () => useUIStore.getState().openNote(note.id) },
    { label: L.noteDetails, icon: '✎', onSelect: () => useUIStore.getState().showEditNoteMeta(note.id) },
    {
      label: LABELS.rowActions.delete, icon: '×', destructive: true,
      onSelect: async () => {
        if (!(await confirmDelete('note', title))) return;
        deleteNoteWithCleanup(note.id);
      },
    },
  ];

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        className={`${styles.row} ${styles.noteRow}`}
        style={{ paddingLeft: `${12 + depth * 18}px`, borderLeftColor: note.color ?? undefined }}
        onClick={() => useUIStore.getState().openNote(note.id)}
      >
        <span className={styles.chevron} aria-hidden="true" />
        <span className={styles.rowIcon} aria-hidden="true">📄</span>
        <span className={styles.rowName}>{title}</span>
        <span className={styles.rowWhen}>{formatRelativeTime(note.updatedAt)}</span>
      </button>
      {subNotes.map((n) => <NoteRow key={n.id} note={views[n.id] ?? n} raw={n} depth={depth + 1} />)}
      {sheetOpen && <ActionSheet title={title} items={actions} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

// ── Recent: the notes last opened, as the history browser's cards ────────────

function RecentNotes() {
  const notes    = useNoteStore((s) => s.notes);
  const noteTags = useNoteStore((s) => s.noteTags);
  const { activeCollectionId } = useEndeavourFilter();
  const recent = Object.values(notes)
    .filter((n) => n.lastViewedAt && !n.archivedAt)
    .filter((n) => !activeCollectionId || getNoteEffectiveCollectionId(n, noteTags) === activeCollectionId)
    .sort((a, b) => (b.lastViewedAt ?? '').localeCompare(a.lastViewedAt ?? ''))
    .slice(0, RECENT_LIMIT);

  if (recent.length === 0) return <div className={styles.empty}><p>{LABELS.mobileNotes.noRecent}</p></div>;
  return (
    <div className={styles.cards}>
      {recent.map((n) => {
        const place = { view: 'notes' as const, at: n.lastViewedAt!, noteId: n.id };
        return (
          <PlaceCard
            key={n.id}
            place={place}
            summary={describePlace(place)}
            className={styles.card}
            badge={<PlaceCardBadge>{formatRelativeTime(n.lastViewedAt!)}</PlaceCardBadge>}
            onClick={() => useUIStore.getState().openNote(n.id)}
          />
        );
      })}
    </div>
  );
}
