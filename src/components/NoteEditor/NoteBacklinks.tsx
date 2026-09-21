import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import type { Note } from '@/types/notes';
import { useNoteBacklinks, type NoteBacklink } from '@/store/noteBacklinks';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import { MAIN_TAB_ID, effectiveLinkTabId, tabNameOf } from '@/utils/noteTabs';
import { ARTIFACT_DRAG_TYPE, insertArtifactLinkAtSelection, removeArtifactMarksFor } from './artifactLinkInsert';
import styles from './NoteBacklinks.module.css';

const ICON: Record<NoteBacklink['type'], string> = { task: '☑️', event: '📅', reminder: '⏰' };

interface Props {
  note:        Note;
  activeTabId: string | null;   // the open tab; null = the main tab
  editor:      Editor | null;
  canInsert:   boolean;
  onSwitchTab: (tabId: string | null) => void;
}

// The return half of a cross-app link, shown in the note itself: every task / calendar item that
// links to this note, whichever side made the link. Links are per tab: one that names a tab shows
// only while that tab is open (a link to the whole note, or to a tab that no longer exists and so
// falls back to the main tab, shows accordingly); links to the note's other tabs are listed apart
// in the chip's popover, with a jump to their tab.
//
// One link on this tab shows as a single pill; more collapse into a "🔗 N" chip that opens the list.
// A pill opens its item on click, can be dragged into the text (it becomes linked text — the same
// artifactLink mark as highlighting text and linking it, see artifactLinkInsert.ts), or inserted at
// the cursor with its ⤵ button — the touch and keyboard route, since drag needs a mouse. Hovering a
// pill shows a red ✕ that removes the link altogether.
export function NoteBacklinks({ note, activeTabId, editor, canInsert, onSwitchTab }: Props) {
  const all = useNoteBacklinks(note.id);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const popRef  = useRef<HTMLDivElement>(null);

  useEscapeClose(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || chipRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Any other action closes the list, so it never gets in the way: a key pressed anywhere (a tab
    // shortcut, typing…) closes it and still does its normal job, because this only observes the
    // event. Keys used to move around inside the list itself (Tab, Enter, arrows while focus is on
    // it) are left alone; so are bare modifier presses and Escape (the Escape stack handles it).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return;
      const t = e.target as Node;
      const inList = !!(popRef.current?.contains(t) || chipRef.current?.contains(t));
      if (inList && !e.ctrlKey && !e.metaKey && !e.altKey) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (all.length === 0) return null;

  const currentTab = activeTabId ?? MAIN_TAB_ID;
  const here: NoteBacklink[] = [];
  const elsewhere: NoteBacklink[] = [];
  for (const l of all) {
    const tab = effectiveLinkTabId(note, l.tabId);
    (!tab || tab === currentTab ? here : elsewhere).push(l);
  }

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = chipRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 320) });
    setOpen(true);
  };

  // Severs the connection from this side: the item forgets the note and the note's text stops
  // linking to the item (the words stay). Ref first, so the editor's removed-link prompt — which
  // sees the unmarking below — finds nothing left to ask about.
  const remove = (l: NoteBacklink) => {
    unlinkCrossAppRef(l.type, l.id, { type: 'note', id: note.id });
    if (editor) removeArtifactMarksFor(editor, l.type, l.id);
  };

  const pill = (l: NoteBacklink, otherTab: boolean) => {
    const otherTabId = otherTab ? effectiveLinkTabId(note, l.tabId) : undefined;
    const otherName = otherTabId ? tabNameOf(note, otherTabId) : null;
    return (
      <span
        key={`${l.type}:${l.id}`}
        className={styles.pill}
        draggable={canInsert && !otherTab}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData(ARTIFACT_DRAG_TYPE, JSON.stringify({ targetType: l.type, targetId: l.id, title: l.title }));
          // Deferred: restyling the source node inside dragstart itself can cancel the drag.
          setTimeout(() => setDragging(true), 0);
        }}
        onDragEnd={() => { setDragging(false); setOpen(false); }}
      >
        <button type="button" className={styles.pillOpen} onClick={() => openArtifactTarget(l.type, l.id)} title={LABELS.noteBacklinks.open}>
          <span aria-hidden="true">{ICON[l.type]}</span>
          <span className={l.done ? styles.done : undefined}>{l.title}</span>
        </button>
        {otherName && otherTabId && (
          <button
            type="button"
            className={styles.tabJump}
            onClick={() => { onSwitchTab(otherTabId === MAIN_TAB_ID ? null : otherTabId); setOpen(false); }}
            title={LABELS.noteBacklinks.goToTab(otherName)}
          >› {otherName}</button>
        )}
        {canInsert && !otherTab && (
          <button
            type="button"
            className={styles.insertBtn}
            // Keeps the editor's selection, so the text lands where the cursor was.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (editor) insertArtifactLinkAtSelection(editor, l.type, l.id, l.title); setOpen(false); }}
            title={LABELS.noteBacklinks.insert}
            aria-label={`Insert a link to ${l.title} at the cursor`}
          >⤵</button>
        )}
        <button
          type="button"
          className={styles.removeBtn}
          onClick={() => remove(l)}
          title={LABELS.noteBacklinks.remove}
          aria-label={`Remove the link to ${l.title}`}
        >×</button>
      </span>
    );
  };

  const chipText = here.length > 0
    ? `🔗 ${here.length}${elsewhere.length > 0 ? ` +${elsewhere.length}` : ''}`
    : `🔗 ${elsewhere.length} on other tabs`;

  return (
    <div className={styles.bar}>
      <span className={styles.label}>{LABELS.noteBacklinks.linkedFrom}</span>
      {here.length === 1 && elsewhere.length === 0 ? pill(here[0], false) : (
        <button
          ref={chipRef}
          type="button"
          className={styles.chip}
          // Opening the list must not take focus from the note (its shortcuts need the editor focused).
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
          aria-expanded={open}
          title={elsewhere.length > 0 ? LABELS.noteBacklinks.chipTitleOtherTabs(here.length, elsewhere.length) : undefined}
        >
          {chipText}
        </button>
      )}
      {open && pos && createPortal(
        <div
          ref={popRef}
          className={`${styles.popover} ${dragging ? styles.popoverDragging : ''}`}
          style={{ top: pos.top, left: pos.left }}
        >
          {here.map((l) => pill(l, false))}
          {elsewhere.length > 0 && (
            <>
              <div className={styles.popoverLabel}>{LABELS.noteBacklinks.otherTabs}</div>
              {elsewhere.map((l) => pill(l, true))}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
