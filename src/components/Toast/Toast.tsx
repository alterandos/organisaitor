import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToastStore, type ToastRequest } from '@/store/toastStore';
import styles from './Toast.module.css';
import { CloseIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';

// THE toast (CLAUDE.md "Toasts"): one at a time, gone after TOAST_MS. How long is left shows as a
// fuse along the toast's own edge (agreed with the user 2026-10-22, as the app's own take on the
// usual draining ring): a line traced round the border that burns away. Hovering holds the toast
// (and the fuse) where they are, and leaving lets them carry on from there, so it can't vanish just
// as the pointer reaches an action. With reduced motion the fuse isn't drawn; the timing is the same.
function ToastView({ toast }: { toast: ToastRequest }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.durationMs);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAt.current = performance.now();
    const timer = setTimeout(() => dismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current));
    };
  }, [paused, toast, dismiss]);

  return createPortal(
    <div
      className={styles.toast}
      role="status"
      aria-live="polite"
      data-paused={paused || undefined}
      style={{ '--toast-ms': `${toast.durationMs}ms` } as React.CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false); }}
    >
      <svg className={styles.fuse} aria-hidden="true">
        <rect className={styles.fuseLine} pathLength={100} />
      </svg>
      <div className={styles.text}>
        <span className={styles.message}>{toast.message}</span>
        {toast.detail && <span className={styles.detail}>{toast.detail}</span>}
      </div>
      {toast.actions.map((a) => (
        <button
          key={a.label}
          type="button"
          className={styles.action}
          onClick={() => { dismiss(toast.id); a.onClick(); }}
        >
          {a.label}
        </button>
      ))}
      <button type="button" className={styles.close} onClick={() => dismiss(toast.id)} aria-label={LABELS.toast.dismiss}><CloseIcon /></button>
    </div>,
    document.body,
  );
}

export function ToastHost() {
  const toast = useToastStore((s) => s.current);
  return toast ? <ToastView key={toast.id} toast={toast} /> : null;
}
