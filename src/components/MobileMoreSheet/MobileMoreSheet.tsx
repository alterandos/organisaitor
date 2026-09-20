import { useRef, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { isAppEnabled } from '@/config/apps';
import styles from './MobileMoreSheet.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

const DISMISS_THRESHOLD_PX = 80;

// Android-only bottom sheet for the overflow of MobileNav's 4-tab bar. Notes/Portfolio/
// Fitness live here regardless of monetization tier (docs/android/00-architecture.md §5b) —
// deliberately decoupled from tier so Notes moving free/paid later never touches this list.
// Manage Library is also routed here since its desktop trigger (hover the header hamburger)
// has no touch equivalent.
export function MobileMoreSheet() {
  const isOpen         = useUIStore((s) => s.mobileMoreSheetOpen);
  const close           = useUIStore((s) => s.closeMobileMoreSheet);
  const setActiveView  = useUIStore((s) => s.setActiveView);
  const openManage      = useUIStore((s) => s.openManage);
  const openSettings    = useUIStore((s) => s.openSettings);
  const openAccount     = useUIStore((s) => s.openAccount);

  const [dragY, setDragY] = useState(0);
  const dragStateRef = useRef<{ startY: number; dragging: boolean } | null>(null);

  useEscapeClose(close, isOpen);

  if (!isOpen) return null;

  const go = (fn: () => void) => { fn(); close(); };

  const handleHandleTouchStart = (e: React.TouchEvent) => {
    dragStateRef.current = { startY: e.touches[0].clientY, dragging: true };
  };
  const handleHandleTouchMove = (e: React.TouchEvent) => {
    const state = dragStateRef.current;
    if (!state?.dragging) return;
    const dy = e.touches[0].clientY - state.startY;
    if (dy > 0) setDragY(dy);
  };
  const handleHandleTouchEnd = () => {
    if (dragY > DISMISS_THRESHOLD_PX) close();
    else setDragY(0);
    dragStateRef.current = null;
  };

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className={styles.sheet}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className={styles.handleArea}
          onTouchStart={handleHandleTouchStart}
          onTouchMove={handleHandleTouchMove}
          onTouchEnd={handleHandleTouchEnd}
        >
          <div className={styles.handle} />
        </div>

        <button className={styles.item} onClick={() => go(() => setActiveView('notes'))}>
          {LABELS.views.notes}
        </button>
        {isAppEnabled('portfolio') && (
          <button className={styles.item} onClick={() => go(() => setActiveView('portfolio'))}>
            {LABELS.views.portfolio}
          </button>
        )}
        {isAppEnabled('fitness') && (
          <button className={styles.item} onClick={() => go(() => setActiveView('fitness'))}>
            {LABELS.views.fitness}
          </button>
        )}

        <div className={styles.divider} />

        <button className={styles.item} onClick={() => go(() => openManage())}>
          Manage Library
        </button>
        <button className={styles.item} onClick={() => go(openSettings)}>
          Settings
        </button>
        <button className={styles.item} onClick={() => go(openAccount)}>
          Account
        </button>
      </div>
    </div>
  );
}
