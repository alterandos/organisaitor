import type { ReactNode } from 'react';
import styles from './FieldError.module.css';

// What an entry still needs before it can be saved, in red under the field it's about (CLAUDE.md
// "A form says what's missing, under the field", adopted 2026-11-03). Give the field
// aria-invalid and aria-describedby={id} while it shows. Nothing when there's nothing to say.
export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return <span id={id} className={styles.error}>{children}</span>;
}
