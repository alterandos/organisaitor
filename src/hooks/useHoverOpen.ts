import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '@/hooks/usePlatform';

// A header button whose panel opens on hover (the bell, Settings), as a preview: open after a
// short delay, closed again a moment after the mouse leaves both the button and the panel (the
// delay lets it cross the gap between them). Clicking the button is the site's own business (the
// bell pins its panel open; Settings opens its full modal).
//
// Android has no hover, and a tap's emulated mouseenter would open the preview on every tap, so
// the handlers do nothing there.
const OPEN_DELAY_MS  = 150;
const CLOSE_DELAY_MS = 250;

export function useHoverOpen(enabled = true) {
  const { isAndroid } = usePlatform();
  const [open, setOpen] = useState(false);
  const openTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = enabled && !isAndroid;

  const clearTimers = useCallback(() => {
    if (openTimer.current)  { clearTimeout(openTimer.current);  openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const handlers = {
    onMouseEnter: () => {
      if (!active) return;
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
      if (open || openTimer.current) return;
      openTimer.current = setTimeout(() => { openTimer.current = null; setOpen(true); }, OPEN_DELAY_MS);
    },
    onMouseLeave: () => {
      if (!active) return;
      if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
      closeTimer.current = setTimeout(() => { closeTimer.current = null; setOpen(false); }, CLOSE_DELAY_MS);
    },
  };

  const close = useCallback(() => { clearTimers(); setOpen(false); }, [clearTimers]);

  return { open: active && open, handlers, close };
}
