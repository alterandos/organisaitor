import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/store/uiStore';
import { describePlace, type PlaceSummary } from '@/components/HistoryBrowser/describePlace';
import { HistoryCarousel, type HistoryCard } from '@/components/HistoryBrowser/HistoryCarousel';
import { LABELS } from '@/config/labels';
import styles from './NavFlash.module.css';

// What a back/forward from the keyboard (Alt+← / Alt+→, Backspace) shows: the history carousel
// (the same cards as the history browser, Alt+N, smaller and without blurring the page), centred
// on where you've just gone, so its notebook and note (or section and item) read at a glance; a
// small arrow at its side says which way you went. It stays while Alt is held (keep pressing ←/→
// to move on) and fades once Alt is let go, or after a moment when the move didn't use Alt
// (Backspace). Never takes a click. Changed 2026-10-15 at the user's request: the big arrow in the
// middle of the screen and the strip of stops at the bottom gave way to this.

const LINGER_MS = 1600;        // a move without Alt held
const AFTER_ALT_MS = 200;      // after Alt is let go (with the 120ms fade: a third of the old 960ms, 2026-10-15)
const SIDE = 2;                // cards either side of where you are

function cardsAround(): { cards: HistoryCard[]; summaries: PlaceSummary[]; here: number } {
  const s = useUIStore.getState();
  const back = [...s.navHistory].reverse().slice(-SIDE);
  const cards: HistoryCard[] = [
    ...back.map((place, i) => ({ place, offset: i - back.length })),
    { place: s.currentPlace(), offset: 0 },
    ...s.navForward.slice(0, SIDE).map((place, i) => ({ place, offset: i + 1 })),
  ];
  return { cards, summaries: cards.map((c) => describePlace(c.place)), here: back.length };
}

export function NavFlash() {
  const flash = useUIStore((s) => s.navFlash);
  // Read when a move happens (adjusting state while rendering, not in an effect).
  const [shown, setShown] = useState<{ seq: number } & ReturnType<typeof cardsAround> | null>(null);
  const [hidden, setHidden] = useState(true);
  if (flash && flash.seq !== shown?.seq) {
    setShown({ seq: flash.seq, ...cardsAround() });
    setHidden(false);
  }

  // Whether Alt is down right now, kept from the keyboard's own events.
  const altDown = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { altDown.current = e.altKey; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Alt') altDown.current = false; };
    const blur = () => { altDown.current = false; };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Stays while Alt is held; fades a moment after it's let go (or after a while, without Alt).
  useEffect(() => {
    if (!flash) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const hideIn = (ms: number) => { if (timer) clearTimeout(timer); timer = setTimeout(() => setHidden(true), ms); };
    const up = (e: KeyboardEvent) => { if (e.key === 'Alt') hideIn(AFTER_ALT_MS); };
    if (altDown.current) window.addEventListener('keyup', up, true);
    else hideIn(LINGER_MS);
    const blur = () => hideIn(0);
    window.addEventListener('blur', blur);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }, [flash]);

  if (!flash || !shown) return null;
  const title = shown.summaries[shown.here]?.title ?? '';
  const L = LABELS.history;

  return createPortal(
    <div className={`${styles.layer} ${hidden ? styles.layerHidden : ''}`} aria-hidden={hidden}>
      <div className={styles.carousel}>
        <HistoryCarousel cards={shown.cards} summaries={shown.summaries} sel={shown.here} visible={SIDE} compact />
        <div key={flash.seq} className={styles.arrow} data-direction={flash.direction} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {flash.direction === 'back' ? <path d="M19 12H5m6-6-6 6 6 6" /> : <path d="M5 12h14m-6-6 6 6-6 6" />}
          </svg>
        </div>
      </div>
      <span className={styles.srOnly} role="status">{flash.direction === 'back' ? L.wentBack(title) : L.wentForward(title)}</span>
    </div>,
    document.body,
  );
}
