import styles from './Icons.module.css';

// One colour, as a small round dot (a note's colour in a menu); with no colour, an empty ring.
export function ColorDotIcon({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      className={`${styles.colorDot} ${color ? '' : styles.colorDotNone} ${className ?? ''}`}
      style={color ? { background: color } : undefined}
      aria-hidden="true"
    />
  );
}
