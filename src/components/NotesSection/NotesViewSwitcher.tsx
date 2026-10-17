import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { NOTE_VIEWS, NOTE_VIEW_ORDER, type NotesViewId } from '@/config/noteViews';
import { LABELS } from '@/config/labels';
import { pageKeyBlocked } from '@/utils/pageKeys';
import { withViewTransition } from '@/utils/viewTransition';
import styles from './NotesViewSwitcher.module.css';

// The Notes view switcher (CLAUDE.md "Notes views"), in the header beside "Notes": the views of
// config/noteViews.ts (never the tools), the one showing pressed. Tab / Shift+Tab cycle them, as
// in Calendar, while nothing is being typed and no overlay is open. Desktop only.

export function NotesViewSwitcher() {
  const notesView = useUIStore((s) => s.notesView);
  const browseView = useUIStore((s) => s.notesBrowseView);
  const current = NOTE_VIEWS[notesView].kind === 'view' ? notesView : browseView;

  const pick = (id: NotesViewId) => {
    if (id === notesView) return;
    withViewTransition('switch', () => useUIStore.getState().setNotesView(id));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
      if (pageKeyBlocked(e)) return;
      const ui = useUIStore.getState();
      if (NOTE_VIEWS[ui.notesView].kind !== 'view') return;
      e.preventDefault();
      const at = NOTE_VIEW_ORDER.indexOf(ui.notesView);
      const next = NOTE_VIEW_ORDER[(at + (e.shiftKey ? -1 : 1) + NOTE_VIEW_ORDER.length) % NOTE_VIEW_ORDER.length];
      withViewTransition('switch', () => ui.setNotesView(next));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={styles.switcher} role="group" aria-label={LABELS.notesViews.switcher}>
      {NOTE_VIEW_ORDER.map((id) => {
        const { Icon, label } = NOTE_VIEWS[id];
        return (
          <button
            key={id}
            type="button"
            className={styles.option}
            aria-pressed={id === current}
            title={LABELS.notesViews.switchHint(label)}
            onClick={() => pick(id)}
          >
            <Icon className={styles.icon} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
