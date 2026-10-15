import { useRef } from 'react';
import { LABELS } from '@/config/labels';
import styles from './ResizeHandle.module.css';

export interface SplitDividerProps {
  // 'x': a vertical line between columns, dragged left and right; 'y': between rows.
  axis:     'x' | 'y';
  // Where it sits, as a fraction of `container` along the axis.
  value:    number;
  container: () => HTMLElement | null;
  onResize: (value: number) => void;   // while dragging
  onCommit: (value: number) => void;
  min?:     number;
  max?:     number;
}

const KEY_STEP = 0.02;

// The divider between two panes that share a space (notes side by side), the split counterpart of
// ResizeHandle (a side panel's edge, in pixels): this one is a fraction of the space, so the panes
// keep their proportions when the window changes. Mouse, pen and touch drag it; arrow keys move it
// when focused; a double-click puts it back in the middle. Positioned by its parent (CSS grid).
export function SplitDivider({ axis, value, container, onResize, onCommit, min = 0.2, max = 0.8 }: SplitDividerProps) {
  const drag = useRef<{ current: number } | null>(null);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  function at(e: React.PointerEvent) {
    const box = container()?.getBoundingClientRect();
    if (!box) return value;
    return clamp(axis === 'x' ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height);
  }
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { current: value };
    document.documentElement.dataset.resizing = axis === 'x' ? '' : 'rows';
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current.current = at(e);
    onResize(drag.current.current);
  }
  function endDrag() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    delete document.documentElement.dataset.resizing;
    onCommit(d.current);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const less = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const more = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== less && e.key !== more) return;
    e.preventDefault();
    e.stopPropagation();
    onCommit(clamp(value + (e.key === more ? KEY_STEP : -KEY_STEP)));
  }

  return (
    <div
      className={`${styles.divider} ${axis === 'x' ? styles.dividerX : styles.dividerY}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={LABELS.resizeSplit}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(0.5)}
    />
  );
}
