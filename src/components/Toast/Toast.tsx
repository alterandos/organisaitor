import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToastStore, type ToastRequest } from '@/store/toastStore';
import styles from './Toast.module.css';

function ToastView({ toast }: { toast: ToastRequest }) {
  const dismiss = useToastStore((s) => s.dismiss);
  // Hovering holds it open, so it can't vanish just as the pointer reaches an action.
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (hovered) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [hovered, toast, dismiss]);

  return createPortal(
    <div
      className={styles.toast}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
      <button type="button" className={styles.close} onClick={() => dismiss(toast.id)} aria-label="Dismiss">×</button>
    </div>,
    document.body,
  );
}

export function ToastHost() {
  const toast = useToastStore((s) => s.current);
  return toast ? <ToastView key={toast.id} toast={toast} /> : null;
}
