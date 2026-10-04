import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import styles from './BottomSheet.module.css';

// THE bottom sheet for phone UI (docs/android/11-design-and-coding-patterns.md §7). Mount it only
// while open. It registers with useEscapeClose, so Escape and the Android back button close it
// like every other overlay. Portaled to document.body so no ancestor's transform or overflow can
// trap it. Closes on a backdrop tap or a drag down on the grabber.

const DISMISS_THRESHOLD_PX = 80;

interface Props {
  onClose:    () => void;
  title?:     string;
  ariaLabel?: string;
  className?: string;
  children:   React.ReactNode;
}

export function BottomSheet({ onClose, title, ariaLabel, className, children }: Props) {
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  // A backdrop tap closes only if the press also STARTED on the backdrop. A sheet opened by a
  // long-press appears under a finger that is still down; the click its release produces must
  // not close it again.
  const pressedBackdrop = useRef(false);

  useEscapeClose(onClose);

  // React bubbles events out of a portal into the component that rendered it — often a row with
  // its own click or drag handlers (a list row would get selected by a backdrop tap). The sheet
  // is its own layer, so nothing in it reaches the tree behind.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => { e.stopPropagation(); pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        e.stopPropagation();
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
        pressedBackdrop.current = false;
      }}
      onMouseDown={stop}
      onMouseUp={stop}
      onTouchStart={stop}
      onTouchEnd={stop}
      onContextMenu={stop}
      onKeyDown={stop}
      onDragStart={stop}
    >
      <div
        className={`${styles.sheet} ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className={styles.grabberArea}
          onTouchStart={(e) => { dragStartY.current = e.touches[0].clientY; }}
          onTouchMove={(e) => {
            if (dragStartY.current === null) return;
            setDragY(Math.max(0, e.touches[0].clientY - dragStartY.current));
          }}
          onTouchEnd={() => {
            if (dragY > DISMISS_THRESHOLD_PX) onClose();
            else setDragY(0);
            dragStartY.current = null;
          }}
        >
          <div className={styles.grabber} />
        </div>
        {title && <div className={styles.title}>{title}</div>}
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
