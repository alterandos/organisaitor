import { useRef, useState } from 'react';
import { notePaneCount, useUIStore } from '@/store/uiStore';
import './openBeside';
import { NoteEditor } from '@/components/NoteEditor/NoteEditor';
import { useNoteView } from '@/store/noteViews';
import { NotePickerModal } from '@/components/NotePickerModal/NotePickerModal';
import { SplitDivider } from '@/components/ResizeHandle/SplitDivider';
import { LABELS } from '@/config/labels';
import { NoteViewMenu } from './NoteViewMenu';
import styles from './NoteSplitView.module.css';

// Notes side by side (asked for by the user, built 2026-10-16): two, three or four notes at once,
// in panes that resize by dragging the lines between them. One ribbon above them all acts on the
// pane last clicked in (its editor's toolbar is portalled into it); each pane keeps its own title
// and tabs. The pane in front holds uiStore's open note, so the note list, links, Quick Access and
// back/forward all open a note there. A note is in one pane at most. Desktop only (Android gap F31).

interface Props {
  focusSignal?: number;
  onNavReturn?: () => void;
}

export function NoteSplitView({ focusSignal, onNavReturn }: Props) {
  const layout = useUIStore((s) => s.noteLayout);
  const panes = useUIStore((s) => s.notePanes);
  const focused = useUIStore((s) => s.focusedNotePane);
  const split = useUIStore((s) => s.noteSplit);
  const setSplit = useUIStore((s) => s.setNoteSplit);
  const focusPane = useUIStore((s) => s.focusNotePane);
  const openInPane = useUIStore((s) => s.openNoteInPane);
  const [ribbon, setRibbon] = useState<HTMLElement | null>(null);
  const [live, setLive] = useState<{ x?: number; y?: number }>({});
  const [picking, setPicking] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const L = LABELS.noteViews;
  // Suggestions from the note in front, as every picker suggests from what it's opened beside.
  const frontNote = useNoteView(panes[focused] ?? null);
  const frontTitle = frontNote?.title ?? '';

  const n = notePaneCount(layout);
  const x = live.x ?? split.x;
  const y = live.y ?? split.y;
  const columns = `minmax(0, ${x}fr) auto minmax(0, ${1 - x}fr)`;
  const rows = layout === 'two' ? 'minmax(0, 1fr)' : `minmax(0, ${y}fr) auto minmax(0, ${1 - y}fr)`;
  const container = () => gridRef.current;
  const divider = (axis: 'x' | 'y', area: string) => (
    <div className={styles.dividerCell} style={{ gridArea: area }} key={area}>
      <SplitDivider
        axis={axis}
        value={axis === 'x' ? x : y}
        container={container}
        onResize={(v) => setLive((l) => ({ ...l, [axis]: v }))}
        onCommit={(v) => { setLive((l) => ({ ...l, [axis]: undefined })); setSplit({ [axis]: v }); }}
      />
    </div>
  );
  const areas = ['a', 'b', 'c', 'd'];

  return (
    <div className={styles.root}>
      <div className={styles.ribbon}>
        <div className={styles.ribbonTools} ref={setRibbon} />
        <NoteViewMenu />
      </div>
      <div
        ref={gridRef}
        className={styles.grid}
        data-layout={layout}
        style={{ gridTemplateColumns: columns, gridTemplateRows: rows }}
      >
        {Array.from({ length: n }, (_, i) => {
          const noteId = panes[i] ?? null;
          return (
            <section
              key={i}
              className={`${styles.pane} ${i === focused ? styles.paneFocused : ''}`}
              style={{ gridArea: areas[i] }}
              onMouseDownCapture={() => focusPane(i)}
              onFocusCapture={() => focusPane(i)}
              aria-label={`${i + 1}`}
            >
              {noteId ? (
                <NoteEditor
                  focusSignal={i === focused ? focusSignal : undefined}
                  onNavReturn={onNavReturn}
                  pane={{ index: i, noteId, focused: i === focused, ribbon }}
                />
              ) : (
                <div className={styles.empty}>
                  <p>{L.empty}</p>
                  <button type="button" className={styles.choose} onClick={() => setPicking(i)}>{L.choose}</button>
                </div>
              )}
            </section>
          );
        })}
        {divider('x', 'v')}
        {layout === 'three' && divider('y', 'h')}
        {layout === 'four' && [divider('y', 'hl'), divider('y', 'hr')]}
      </div>
      {picking !== null && (
        <NotePickerModal
          excludeIds={new Set(panes.filter((p): p is string => !!p))}
          suggestFrom={frontTitle}
          onPick={(noteId, tabId) => { openInPane(picking, noteId, tabId); setPicking(null); }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
