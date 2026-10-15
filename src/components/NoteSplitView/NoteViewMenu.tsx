import { useEffect, useState } from 'react';
import { NOTE_LAYOUTS, useUIStore, type NoteLayout } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { flushOpenNoteEditors } from '@/services/liveNoteEditor';
import { LABELS } from '@/config/labels';
import styles from './NoteSplitView.module.css';

// A small drawing of a layout: one note, two, three, four.
function LayoutIcon({ layout }: { layout: NoteLayout }) {
  const paths: Record<NoteLayout, string> = {
    single: 'M2.5 3h11v10h-11z',
    two:    'M2.5 3h11v10h-11zM8 3v10',
    three:  'M2.5 3h11v10h-11zM8 3v10M2.5 8H8',
    four:   'M2.5 3h11v10h-11zM8 3v10M2.5 8h11',
  };
  return (
    <svg className={styles.menuIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d={paths[layout]} />
    </svg>
  );
}

// The ribbon's View ▾ (notes side by side): one note, two side by side, three, four. In the
// note's own toolbar while one note shows; in the shared ribbon while several do.
export function NoteViewMenu() {
  const layout = useUIStore((s) => s.noteLayout);
  const setLayout = useUIStore((s) => s.setNoteLayout);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const id = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', close); };
  }, [open]);
  useEscapeClose(() => setOpen(false), open);
  const L = LABELS.noteViews;

  return (
    <div className={styles.menuAnchor}>
      <button
        type="button"
        className={`${styles.menuButton} ${open ? styles.menuButtonOn : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={L.menuTitle}
        aria-haspopup="menu"
        aria-expanded={open}
      ><LayoutIcon layout={layout} /> {L.menu} ▾</button>
      {open && (
        <div className={styles.menu} role="menu" onClick={(e) => e.stopPropagation()}>
          {NOTE_LAYOUTS.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={layout === l}
              className={`${styles.menuItem} ${layout === l ? styles.menuItemOn : ''}`}
              onClick={() => { flushOpenNoteEditors(); setLayout(l); setOpen(false); }}
            >
              <LayoutIcon layout={l} />
              <span>{L.layouts[l]}</span>
              {layout === l && <span className={styles.menuCheck} aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
