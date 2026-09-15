import { useEffect, useRef, useState } from 'react';

const TRIGGER_DISTANCE = 64;
const MAX_DISTANCE = 100;

// Android-only pull-to-refresh (docs/android/01-tasks-app.md §4) — a standard mobile
// affordance for "make sure I have the latest data." Only activates when the scroll
// container is already at its top (scrollTop === 0), so it never fights normal scrolling.
export function usePullToRefresh<T extends HTMLElement>(
  onRefresh: () => void | Promise<void>,
  enabled: boolean,
) {
  const ref = useRef<T>(null);
  const dragRef = useRef<{ startY: number; active: boolean } | null>(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0 || refreshing) { dragRef.current = null; return; }
      dragRef.current = { startY: e.touches[0].clientY, active: true };
    };
    const onTouchMove = (e: TouchEvent) => {
      const d = dragRef.current;
      if (!d?.active) return;
      const dy = e.touches[0].clientY - d.startY;
      if (dy <= 0) { setDistance(0); return; }
      e.preventDefault();
      setDistance(Math.min(dy * 0.5, MAX_DISTANCE));
    };
    const onTouchEnd = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d?.active) return;
      setDistance((current) => {
        if (current >= TRIGGER_DISTANCE) {
          setRefreshing(true);
          Promise.resolve(onRefresh()).finally(() => setRefreshing(false));
        }
        return 0;
      });
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, onRefresh, refreshing]);

  return { ref, distance, refreshing };
}
