import { LABELS } from '@/config/labels';
import styles from './TimeInput.module.css';

// ▲▼ beside a segment of a segmented field (TimeInput, DateInput): shown on hover, out of the Tab
// order (the arrow keys do the same), and never take the focus from the segment being typed in.
export function SegmentStepper({ label, onUp, onDown }: { label: string; onUp: () => void; onDown: () => void }) {
  const L = LABELS.timeInput;
  return (
    <>
      <button type="button" tabIndex={-1} className={`${styles.step} ${styles.stepUp}`} aria-label={`${L.increase} ${label}`}
        onMouseDown={(e) => e.preventDefault()} onClick={onUp}>
        <svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 5l4-4 4 4" /></svg>
      </button>
      <button type="button" tabIndex={-1} className={`${styles.step} ${styles.stepDown}`} aria-label={`${L.decrease} ${label}`}
        onMouseDown={(e) => e.preventDefault()} onClick={onDown}>
        <svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg>
      </button>
    </>
  );
}
