import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNotesBrowse } from '@/hooks/useNotesBrowse';
import { notesNav } from '@/services/notesNav';
import { LABELS } from '@/config/labels';
import { withViewTransition } from '@/utils/viewTransition';
import type { NoteGroup } from '@/utils/notesBrowse';
import { LEVEL_MAX, tileSizes } from './mosaicLayout';
import { MosaicTile } from './MosaicTile';
import { MosaicNoteCard } from './MosaicNoteCard';
import { ViewBar } from '../ViewBar';
import { NoteLevel } from '../NoteLevel';
import { moveFocusInGrid } from '../gridFocus';
import styles from './Mosaic.module.css';

// The Mosaic (agreed with the user 2026-10-17): the notes as tiles, one level at a time. Each tile
// is a group (a notebook, an Endeavour, a Purpose or a tag: the grouping), sized by how busy it is;
// hovering it (or Space) opens a peek beside it with everything it holds, and going in (a click,
// Enter) zooms into it, a back/forward stop. A note is the deepest level (NoteLevel, shared with the
// Map). Built on the browse model only
// (useNotesBrowse, notesNav: CLAUDE.md "Notes views").

export function MosaicView() {
  const b = useNotesBrowse();
  const [showAll, setShowAll] = useState<string | null>(null);   // the level whose "N more" was opened
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const L = LABELS.notesViews;

  const here: NoteGroup | null = b.focusPath[b.focusPath.length - 1] ?? null;
  // The notebook being looked at (its notes need no notebook beside their names).
  const hereNotebook = here?.grouping === 'notebook' ? here.sourceId : null;
  const levelKey = here?.id ?? 'top';
  const filtering = b.filter.collectionIds.length + b.filter.purposeIds.length + b.filter.tagIds.length > 0 || !!b.headerEndeavourId;
  const groups = (here ? here.children : b.roots).filter((g) => !filtering || g.total > 0);
  const notes = here ? here.noteIds : b.loose;
  const shownGroups = showAll === levelKey ? groups : groups.slice(0, LEVEL_MAX);
  const hidden = groups.length - shownGroups.length;
  // A pinned group (Stickies) gets a row of its own, with a line under it.
  const pinnedGroups = shownGroups.filter((g) => g.pinned);
  const otherGroups = shownGroups.filter((g) => !g.pinned);
  // "Recent" is measured from when the Mosaic was opened, so sizes don't shift while you look.
  const [now] = useState(() => Date.now());
  const sizes = useMemo(() => tileSizes(groups, now), [groups, now]);

  const goInto = (id: string | null, out = false) => withViewTransition(out ? 'zoom-out' : 'zoom-in', () => notesNav.focusGroup(id));
  const open = (noteId: string) => withViewTransition('zoom-in', () => notesNav.openNote(noteId));

  if (b.openNoteId) {
    return <NoteLevel browse={b} here={here} backTo={here?.label ?? L.allNotes} />;
  }

  const groupingLabel = L.groupings[b.grouping];
  const empty = Object.keys(b.notes).length === 0;

  return (
    <div className={styles.mosaic}>
      <ViewBar browse={b} onGoTo={(id) => goInto(id, true)} />

      <div ref={scrollRef} className={styles.scroll}>
        {empty ? (
          <p className={styles.empty}>{filtering ? L.noMatch : L.emptyAll}</p>
        ) : groups.length === 0 && notes.length === 0 ? (
          <p className={styles.empty}>{L.emptyLevel}</p>
        ) : (
          <div ref={gridRef} className={styles.levels} onKeyDown={(e: ReactKeyboardEvent) => moveFocusInGrid(e, gridRef.current)}>
            {pinnedGroups.length > 0 && (
              <>
                <div className={styles.grid}>
                  {pinnedGroups.map((g) => (
                    <MosaicTile key={g.id} group={g} size={sizes[g.id] ?? 'small'} notes={b.notes} nameOf={b.nameOf} boundsRef={scrollRef}
                      onEnter={() => goInto(g.id)} onOpenNote={open} onEnterGroup={(id) => goInto(id)} />
                  ))}
                </div>
                {otherGroups.length + notes.length > 0 && <hr className={styles.pinnedRule} />}
              </>
            )}
            {otherGroups.length > 0 && (
              <div className={styles.grid}>
                {otherGroups.map((g) => (
                  <MosaicTile key={g.id} group={g} size={sizes[g.id] ?? 'small'} notes={b.notes} nameOf={b.nameOf} boundsRef={scrollRef}
                    onEnter={() => goInto(g.id)} onOpenNote={open} onEnterGroup={(id) => goInto(id)} />
                ))}
                {hidden > 0 && (
                  <button type="button" data-view-tile="" className={`${styles.tile} ${styles.moreTile}`} onClick={() => setShowAll(levelKey)}>
                    {L.more(hidden)}
                  </button>
                )}
              </div>
            )}
            {notes.length > 0 && (
              <>
                {!here && shownGroups.length > 0 && <h2 className={styles.sectionHeading}>{L.unfiled(groupingLabel)}</h2>}
                <div className={`${styles.grid} ${styles.noteGrid}`}>
                  {notes.map((id) => b.notes[id] && (
                    <MosaicNoteCard key={id} note={b.notes[id]} name={b.nameOf(id, hereNotebook)} subCount={b.subNotes[id]?.length ?? 0} onOpen={() => open(id)} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
