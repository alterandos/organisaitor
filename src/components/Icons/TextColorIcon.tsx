import styles from './Icons.module.css';

interface Props {
  // The colour in use, if any: shown in the middle of the swatch.
  current?: string | null;
  className?: string;
}

// "Text colour": a small rounded square of every hue (a palette, not an underlined A, which reads
// as Underline at a glance). The current colour, when there is one, sits in the middle.
export function TextColorIcon({ current, className }: Props) {
  return (
    <span className={`${styles.textColor} ${className ?? ''}`} aria-hidden="true">
      {current && <span className={styles.textColorCurrent} style={{ background: current }} />}
    </span>
  );
}
