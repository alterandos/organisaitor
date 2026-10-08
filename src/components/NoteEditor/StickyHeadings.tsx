import { Fragment, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { LABELS } from '@/config/labels';
import { STICKY_SCALE_MAX, STICKY_SCALE_MIN, useSettingsStore } from '@/store/settingsStore';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import { headingTrail, watchReadingPosition, type HeadingCrumb } from './headingTrail';
import styles from './StickyHeadings.module.css';

// Sticky headings: while a note scrolls, a one-line trail at the top names the headings the top of
// the view is inside ("1 Intro › 1.2 Method"); clicking one scrolls back to it. It's the first
// child of the editor's scroll area and pinned there, so on a phone it sits under the note's
// heading and moves up with it when that hides. Its text size is A− / A+ at its right (on hover,
// always on touch) or its right-click menu. Off with Headings ▸ Sticky headings or Settings.

const sameTrail = (a: HeadingCrumb[], b: HeadingCrumb[]) => a.length === b.length && a.every((c, i) => c.el === b[i].el && c.text === b[i].text);

export function StickyHeadings({ editor }: { editor: Editor }) {
  const enabled = useSettingsStore((s) => s.stickyHeadings);
  const scale = useSettingsStore((s) => s.stickyHeadingsScale);
  const stepScale = useSettingsStore((s) => s.stepStickyHeadingsScale);
  const toggleSticky = useSettingsStore((s) => s.toggleStickyHeadings);
  const hostRef = useRef<HTMLDivElement>(null);
  const [trail, setTrail] = useState<HeadingCrumb[]>([]);
  const L = LABELS.noteHeadings;

  useEffect(() => {
    const host = hostRef.current?.parentElement;
    if (!enabled || !host) return;
    return watchReadingPosition(host, editor, () => {
      const next = headingTrail(editor.view.dom as HTMLElement, host);
      setTrail((prev) => (sameTrail(prev, next) ? prev : next));
    });
  }, [editor, enabled]);

  useContextMenuScope(hostRef, () => ({
    kind: 'sticky-headings',
    items: () => [
      { id: 'larger', label: L.textLarger, icon: 'A+', disabled: scale >= STICKY_SCALE_MAX, run: () => stepScale(1) },
      { id: 'smaller', label: L.textSmaller, icon: 'A−', disabled: scale <= STICKY_SCALE_MIN, run: () => stepScale(-1) },
      { id: 'off', label: L.stickyOff, run: toggleSticky },
    ],
  }));

  function goTo(el: HTMLElement) {
    const host = hostRef.current?.parentElement;
    const strip = hostRef.current?.firstElementChild as HTMLElement | null;
    if (!host) return;
    host.scrollBy({ top: el.getBoundingClientRect().top - host.getBoundingClientRect().top - (strip?.offsetHeight ?? 0) });
  }

  const shown = enabled && trail.length > 0;
  return (
    <div ref={hostRef} className={styles.host}>
      {shown && (
        <div className={styles.bar} style={{ ['--trail-scale' as string]: scale }}>
          <nav className={styles.trail} aria-label={L.trail}>
            {trail.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <span className={styles.sep} aria-hidden="true">›</span>}
                <button type="button" className={styles.crumb} onClick={() => goTo(c.el)} title={L.goTo(c.text)}>
                  {c.number && <span className={styles.number}>{c.number}</span>}
                  <span className={styles.text}>{c.text}</span>
                </button>
              </Fragment>
            ))}
          </nav>
          <div className={styles.sizeControls}>
            <button type="button" className={styles.sizeBtn} onClick={() => stepScale(-1)} disabled={scale <= STICKY_SCALE_MIN} aria-label={L.textSmaller} title={L.textSmaller}>A−</button>
            <button type="button" className={styles.sizeBtn} onClick={() => stepScale(1)} disabled={scale >= STICKY_SCALE_MAX} aria-label={L.textLarger} title={L.textLarger}>A+</button>
          </div>
        </div>
      )}
    </div>
  );
}
