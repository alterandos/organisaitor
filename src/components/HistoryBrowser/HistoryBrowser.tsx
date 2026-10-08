import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/store/uiStore';
import type { NavPlace } from '@/store/navHistory';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { SECTION_ICONS } from '@/components/NavSidebar/navItems';
import { LABELS } from '@/config/labels';
import { formatRelativeTime } from '@/utils/date';
import { describePlace } from './describePlace';
import styles from './HistoryBrowser.module.css';

// Alt+N: the app's history (store/navHistory.ts) as a carousel of cards — oldest on the left,
// where you are in the middle, anything you went back from on the right. Scroll, ← →, swipe or
// click to move; Enter or a click on the centred card goes there (travelHistory, so the stops in
// between stay in history). Cards are read live when it opens (describePlace).

const VISIBLE = 4;         // cards drawn either side of the centred one
const WHEEL_STEP = 60;     // wheel distance per card
const SWIPE_STEP = 90;     // drag distance per card

interface Card { place: NavPlace; offset: number }   // offset: steps from where you are

export function HistoryBrowser() {
  const close = useUIStore((s) => s.closeHistoryBrowser);
  useEscapeClose(close);

  // Read once on open: history doesn't change while the browser is up.
  const [cards] = useState<Card[]>(() => {
    const s = useUIStore.getState();
    const back = [...s.navHistory].reverse();
    return [
      ...back.map((place, i) => ({ place, offset: i - back.length })),
      { place: s.currentPlace(), offset: 0 },
      ...s.navForward.map((place, i) => ({ place, offset: i + 1 })),
    ];
  });
  const here = cards.findIndex((c) => c.offset === 0);
  const [sel, setSel] = useState(here);
  const summaries = useMemo(() => cards.map((c) => describePlace(c.place)), [cards]);

  const move = (by: number) => setSel((v) => Math.max(0, Math.min(cards.length - 1, v + by)));
  function go(i: number) {
    close();
    const steps = cards[i].offset;
    if (steps !== 0) useUIStore.getState().travelHistory(steps);
  }

  const wheel = useRef(0);
  const drag = useRef<{ x: number; moved: number } | null>(null);

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-label={LABELS.history.title}
      tabIndex={-1}
      ref={(el) => el?.focus()}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'Home') { e.preventDefault(); setSel(0); }
        else if (e.key === 'End') { e.preventDefault(); setSel(cards.length - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); go(sel); }
      }}
      onWheel={(e) => {
        wheel.current += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        while (Math.abs(wheel.current) >= WHEEL_STEP) {
          const dir = Math.sign(wheel.current);
          move(dir);
          wheel.current -= dir * WHEEL_STEP;
        }
      }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, moved: 0 }; }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) >= SWIPE_STEP) { move(dx < 0 ? 1 : -1); d.x = e.clientX; d.moved++; }
      }}
      onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>{LABELS.history.title}</h2>
        <p className={styles.hint}>{LABELS.history.hint}</p>
      </header>

      <div className={styles.stage}>
        {cards.map((card, i) => {
          const d = i - sel;
          if (Math.abs(d) > VISIBLE) return null;
          const s = summaries[i];
          const { place, offset } = card;
          return (
            <article
              key={i}
              className={`${styles.card} ${d === 0 ? styles.cardSel : ''} ${s.removed ? styles.cardRemoved : ''}`}
              data-view={place.view}
              style={{ ['--d' as string]: d, ['--ad' as string]: Math.abs(d), ['--s' as string]: Math.sign(d) }}
              aria-current={d === 0}
              onClick={() => { if (drag.current?.moved) return; if (d === 0) go(i); else setSel(i); }}
            >
              <div className={styles.band}>
                <span className={styles.sectionIcon} aria-hidden="true">{SECTION_ICONS[place.view]}</span>
                <span className={styles.section}>{LABELS.views[place.view]}</span>
                {offset === 0
                  ? <span className={styles.badgeHere}>{LABELS.history.here}</span>
                  : <span className={styles.when}>{offset > 0 ? LABELS.history.forward : formatRelativeTime(place.at)}</span>}
              </div>
              <div className={styles.body}>
                {s.path.length > 0 && <div className={styles.path}>{s.path.join(' › ')}</div>}
                <h3 className={styles.cardTitle}>{s.title}</h3>
                {s.detail && <div className={styles.detail}>{s.detail}</div>}
                {s.preview && <p className={styles.preview}>{s.preview}</p>}
              </div>
              {d === 0 && offset !== 0 && <div className={styles.open}>{LABELS.history.open} ↵</div>}
            </article>
          );
        })}
      </div>

      <div className={styles.dots} aria-hidden="true">
        {cards.map((c, i) => (
          <span key={i} className={`${styles.dot} ${i === sel ? styles.dotSel : ''} ${c.offset === 0 ? styles.dotHere : ''}`} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
