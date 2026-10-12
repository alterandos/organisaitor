import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/store/uiStore';
import type { NavPlace } from '@/store/navHistory';
import { SECTION_ICONS } from '@/components/NavSidebar/navItems';
import { describePlace } from '@/components/HistoryBrowser/describePlace';
import { LABELS } from '@/config/labels';
import styles from './NavFlash.module.css';

// What a back/forward from the keyboard (Alt+← / Alt+→, Backspace) shows for a moment: a large
// arrow in the middle of the screen that fades, and a small strip at the bottom with the stops
// either side of where you are (the history browser, Alt+N, in miniature). Never takes a click.
// One arrow at a time: the next move replaces it, so arrows never stack up.

const STRIP_MS = 1600;
const SIDE = 2;   // stops shown either side of where you are

interface Stop { place: NavPlace; offset: number }

function stopsAround(): Stop[] {
  const s = useUIStore.getState();
  const back = [...s.navHistory].reverse().slice(-SIDE);
  return [
    ...back.map((place, i) => ({ place, offset: i - back.length })),
    { place: s.currentPlace(), offset: 0 },
    ...s.navForward.slice(0, SIDE).map((place, i) => ({ place, offset: i + 1 })),
  ];
}

export function NavFlash() {
  const flash = useUIStore((s) => s.navFlash);
  // Read when a move happens (adjusting state while rendering, not in an effect).
  const [shown, setShown] = useState<{ seq: number; stops: Stop[] } | null>(null);
  const [hidden, setHidden] = useState(true);
  if (flash && flash.seq !== shown?.seq) {
    setShown({ seq: flash.seq, stops: stopsAround() });
    setHidden(false);
  }

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setHidden(true), STRIP_MS);
    return () => clearTimeout(t);
  }, [flash]);

  if (!flash || !shown) return null;
  const here = shown.stops.find((s) => s.offset === 0);
  const title = here ? describePlace(here.place).title : '';
  const L = LABELS.history;

  return createPortal(
    <div className={styles.layer} aria-hidden={hidden}>
      <div key={flash.seq} className={styles.arrow} data-direction={flash.direction} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {flash.direction === 'back' ? <path d="M19 12H5m6-6-6 6 6 6" /> : <path d="M5 12h14m-6-6 6 6-6 6" />}
        </svg>
      </div>
      <div className={`${styles.strip} ${hidden ? styles.stripHidden : ''}`}>
        {shown.stops.map(({ place, offset }) => (
          <div key={`${offset}`} className={`${styles.stop} ${offset === 0 ? styles.here : ''}`}>
            <span className={styles.icon} aria-hidden="true">{SECTION_ICONS[place.view]}</span>
            <span className={styles.title}>{describePlace(place).title}</span>
          </div>
        ))}
      </div>
      <span className={styles.srOnly} role="status">{flash.direction === 'back' ? L.wentBack(title) : L.wentForward(title)}</span>
    </div>,
    document.body,
  );
}
