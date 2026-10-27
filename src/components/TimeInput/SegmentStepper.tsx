import { LABELS } from '@/config/labels';
import { StepIcon } from '@/components/Icons';
import styles from './TimeInput.module.css';

// ▲▼ for one segment of a segmented field (TimeInput, DateInput). While the segment is hovered it
// grows into a small column, ▲ above the digits and ▼ below, drawn as one box with them, so the
// pointer never crosses a gap on its way to an arrow (a gap between what's hovered and what it
// reveals makes the reveal vanish mid-move), and each arrow is as wide as the segment. They stay a
// moment after the pointer leaves, so overshooting doesn't lose them. Out of the Tab order (↑↓ do
// the same) and never take the focus from the segment being typed in.
export function SegmentStepper({ label, onUp, onDown }: { label: string; onUp: () => void; onDown: () => void }) {
  const L = LABELS.timeInput;
  return (
    <span className={styles.stepper}>
      <button type="button" tabIndex={-1} className={styles.step} aria-label={`${L.increase} ${label}`}
        onMouseDown={(e) => e.preventDefault()} onClick={onUp}>
        <StepIcon direction="up" />
      </button>
      <button type="button" tabIndex={-1} className={styles.step} aria-label={`${L.decrease} ${label}`}
        onMouseDown={(e) => e.preventDefault()} onClick={onDown}>
        <StepIcon direction="down" />
      </button>
    </span>
  );
}
