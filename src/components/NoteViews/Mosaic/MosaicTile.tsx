import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { LABELS } from '@/config/labels';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import type { NoteGroup } from '@/utils/notesBrowse';
import type { Note } from '@/types/notes';
import type { NoteName } from '@/utils/notes';
import { peekSections, type TileSize } from './mosaicLayout';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import { pinMenuItem } from '@/services/quickAccessPins';
import styles from './Mosaic.module.css';

// A group's tile: its colour, icon, name and count, its own groups as chips and its newest notes.
// Hovering it (300 ms), or Space, opens a peek beside it with everything it holds: its groups (go
// straight in) and all its notes, sectioned by notebook (asked for 2026-10-17: the burst it had
// before showed at most 8, 7 of 32 in one case). Click or Enter goes into the group.

const SHOW_MS = 300;
const HIDE_MS = 180;
const PEEK_W = 288;   // .peek's width (18rem), to choose the side with room

interface Props {
  group:        NoteGroup;
  size:         TileSize;
  notes:        Record<string, Note>;
  nameOf:       (noteId: string, hereNotebookId?: string | null) => NoteName;
  onEnter:      () => void;
  onEnterGroup: (groupId: string) => void;
  onOpenNote:   (noteId: string) => void;
  // The scrolling area the peek should stay inside (it opens on whichever side has room).
  boundsRef:    RefObject<HTMLElement | null>;
}

export function MosaicTile({ group, size, notes, nameOf, onEnter, onEnterGroup, onOpenNote, boundsRef }: Props) {
  const L = LABELS.notesViews;
  // Inside a notebook's tile, its own notes need no notebook beside their names.
  const hereNotebook = group.grouping === 'notebook' ? group.sourceId : null;
  const [peek, setPeek] = useState<'right' | 'left' | null>(null);
  const tileRef = useRef<HTMLButtonElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clear, []);

  const holds = group.total > 0 || group.children.length > 0;
  const open = () => {
    const r = tileRef.current?.getBoundingClientRect();
    const area = boundsRef.current?.getBoundingClientRect();
    setPeek(r && area && r.right + PEEK_W + 16 > area.right && r.left - PEEK_W - 16 >= area.left ? 'left' : 'right');
  };
  const close = () => { clear(); setPeek(null); };
  useEscapeClose(() => { close(); tileRef.current?.focus(); }, !!peek);
  // A notebook's or an Endeavour's tile can be pinned to Quick Access (purposes and tags can't).
  const pinType = group.grouping === 'notebook' ? 'notebook' as const : group.grouping === 'endeavour' ? 'endeavour' as const : null;
  useContextMenuScope(tileRef, () => ({ kind: 'note-group', items: () => (pinType ? [pinMenuItem(pinType, group.sourceId)] : []) }), !!pinType);

  const recent = newestInside(group, notes, size === 'large' ? 5 : size === 'wide' ? 3 : 2);
  const subGroups = size === 'small' ? [] : group.children.slice(0, size === 'large' ? 8 : 4);
  const sections = peek ? peekSections(group, (id) => nameOf(id, hereNotebook).notebook) : [];

  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' || !holds) return;
    e.preventDefault();
    if (peek) { close(); return; }
    open();
    requestAnimationFrame(() => peekRef.current?.querySelector<HTMLElement>('button')?.focus());
  };
  const onPeekKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const buttons = [...(peekRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    e.stopPropagation();
    buttons[Math.max(0, Math.min(buttons.length - 1, at + step))].focus();
  };

  return (
    <div
      className={`${styles.tileWrap} ${styles[size]} ${peek ? styles.peeking : ''}`}
      onMouseEnter={() => { clear(); if (holds) timer.current = setTimeout(open, SHOW_MS); }}
      onMouseLeave={() => { clear(); timer.current = setTimeout(() => setPeek(null), HIDE_MS); }}
    >
      <button
        ref={tileRef}
        type="button"
        data-view-tile=""
        className={`${styles.tile} ${group.total === 0 ? styles.tileEmpty : ''}`}
        style={group.color ? ({ '--tile-accent': group.color } as CSSProperties) : undefined}
        aria-label={L.openGroup(group.label, group.total)}
        aria-expanded={holds ? !!peek : undefined}
        onClick={() => { close(); onEnter(); }}
        onKeyDown={onKey}
      >
        <span className={styles.tileHead}>
          {group.icon && <span className={styles.tileIcon} aria-hidden="true"><ItemIcon icon={group.icon} /></span>}
          <span className={styles.tileName}>{group.label}</span>
        </span>
        <span className={styles.tileCount}>
          {L.notesCount(group.total)}
          {group.children.length > 0 && <> · {L.groupsInside(group.children.length, L.groupings[group.grouping])}</>}
        </span>
        {subGroups.length > 0 && (
          <span className={styles.tileGroups}>
            {subGroups.map((c) => <span key={c.id} className={styles.tileGroup}>{c.icon ? <><ItemIcon icon={c.icon} />{' '}</> : ''}{c.label}</span>)}
          </span>
        )}
        {recent.length > 0 && (
          <span className={styles.tileRecent}>
            {recent.map((n) => <span key={n.id} className={styles.tileRecentItem}>{nameOf(n.id, hereNotebook).full}</span>)}
          </span>
        )}
      </button>
      {peek && (
        <div ref={peekRef} className={`${styles.peek} ${peek === 'left' ? styles.peekLeft : styles.peekRight}`}
          role="group" aria-label={L.peekLabel(group.label)} onKeyDown={onPeekKey}>
          {group.children.length > 0 && (
            <div className={styles.peekSection}>
              <p className={styles.peekHeading}>{L.groupings[group.grouping]}</p>
              <div className={styles.peekGroups}>
                {group.children.map((c) => (
                  <button key={c.id} type="button" className={styles.peekGroup} onClick={() => { close(); onEnterGroup(c.id); }}>
                    {c.icon ? <><ItemIcon icon={c.icon} />{' '}</> : ''}{c.label} · {c.total}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sections.map((sec) => (
            <div key={sec.key} className={styles.peekSection}>
              <p className={styles.peekHeading}>{sec.heading ?? (hereNotebook ? L.notesHere : L.noNotebook)}</p>
              <ul className={styles.peekNotes}>
                {sec.noteIds.map((id) => (
                  <li key={id}>
                    <button type="button" className={styles.peekNote} title={nameOf(id).path || undefined} onClick={() => { close(); onOpenNote(id); }}>
                      {nameOf(id).title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The newest notes anywhere inside a group.
function newestInside(group: NoteGroup, notes: Record<string, Note>, n: number): Note[] {
  const ids = new Set<string>();
  const walk = (g: NoteGroup) => { g.noteIds.forEach((id) => ids.add(id)); g.children.forEach(walk); };
  walk(group);
  return [...ids].map((id) => notes[id]).filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, n);
}
