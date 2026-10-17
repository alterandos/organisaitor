import type { ReactNode } from 'react';
import { LABELS } from '@/config/labels';
import { notesNav } from '@/services/notesNav';
import { withViewTransition } from '@/utils/viewTransition';
import type { NotesBrowseView } from '@/hooks/useNotesBrowse';
import type { NoteGroupingId } from '@/utils/notesBrowse';
import { ViewFilter } from './ViewFilter';
import styles from './NoteViews.module.css';

// The bar along the top of a Notes view: where you are (the trail; a crumb goes back out), how the
// notes are grouped, the filter, and the view's own controls (`children`). Shared by every view on
// the browse model, so they all read the same way.

const GROUPINGS: NoteGroupingId[] = ['notebook', 'endeavour', 'purpose', 'tag'];

export function ViewBar({ browse, onGoTo, children }: { browse: NotesBrowseView; onGoTo: (groupId: string | null) => void; children?: ReactNode }) {
  const L = LABELS.notesViews;
  const path = browse.focusPath;
  return (
    <div className={styles.bar}>
      <nav className={styles.trail} aria-label={L.trail}>
        <button type="button" className={styles.crumb} aria-current={path.length ? undefined : 'page'} onClick={() => path.length && onGoTo(null)}>{L.allNotes}</button>
        {path.map((g, i) => (
          <span key={g.id} className={styles.crumbWrap}>
            <span className={styles.crumbSep} aria-hidden="true">›</span>
            <button type="button" className={styles.crumb} aria-current={i === path.length - 1 ? 'page' : undefined}
              onClick={() => i < path.length - 1 && onGoTo(g.id)}>{g.label}</button>
          </span>
        ))}
      </nav>
      <div className={styles.barRight}>
        {children}
        <div className={styles.segment} role="group" aria-label={L.groupBy}>
          {GROUPINGS.map((g) => (
            <button key={g} type="button" className={styles.segmentBtn} aria-pressed={g === browse.grouping}
              onClick={() => g !== browse.grouping && withViewTransition('switch', () => notesNav.setGrouping(g))}>{L.groupings[g]}</button>
          ))}
        </div>
        <ViewFilter filter={browse.filter} options={browse.options} />
      </div>
    </div>
  );
}
