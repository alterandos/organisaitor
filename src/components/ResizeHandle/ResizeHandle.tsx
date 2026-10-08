import { useEffect, useRef } from 'react';
import { LABELS } from '@/config/labels';
import styles from './ResizeHandle.module.css';

export interface ResizeHandleProps {
  // Which edge of the pane it sits on: 'left' for a pane on the right of the screen.
  edge:     'left' | 'right';
  min:      number;
  max:      number;
  width:    number | null;          // null: the pane's CSS width (read from the pane when needed)
  onResize: (width: number) => void; // while dragging
  onCommit: (width: number) => void;
  onReset:  () => void;              // double-click: back to the CSS width
}

const KEY_STEP = 16;

// The draggable edge of a side panel; rendered as a child of the pane (which needs a position
// other than static). Mouse, pen and touch drag it; arrow keys move it when focused; a double-click
// resets it. Made only through usePaneWidth.
export function ResizeHandle({ edge, min, max, width, onResize, onCommit, onReset }: ResizeHandleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startWidth: number; current: number } | null>(null);

  // A pane that scrolls its own content would carry the handle away with it: keep it over the
  // visible edge.
  useEffect(() => {
    const el = ref.current;
    const pane = el?.parentElement;
    if (!el || !pane) return;
    const follow = () => { el.style.transform = pane.scrollTop ? `translateY(${pane.scrollTop}px)` : ''; };
    pane.addEventListener('scroll', follow, { passive: true });
    return () => pane.removeEventListener('scroll', follow);
  }, []);

  const clamp = (w: number) => Math.round(Math.max(min, Math.min(max, window.innerWidth - 120, w)));
  const currentWidth = () => width ?? ref.current?.parentElement?.getBoundingClientRect().width ?? min;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startWidth = currentWidth();
    drag.current = { startX: e.clientX, startWidth, current: startWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.documentElement.dataset.resizing = '';
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    d.current = clamp(d.startWidth + (edge === 'right' ? dx : -dx));
    onResize(d.current);
  }
  function endDrag() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    delete document.documentElement.dataset.resizing;
    if (d.current !== d.startWidth) onCommit(d.current);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const grows = (e.key === 'ArrowRight') === (edge === 'right');
    onCommit(clamp(currentWidth() + (grows ? KEY_STEP : -KEY_STEP)));
  }

  return (
    <div
      ref={ref}
      className={`${styles.handle} ${edge === 'left' ? styles.left : styles.right}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={LABELS.resizePane}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title={LABELS.resizePane}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
