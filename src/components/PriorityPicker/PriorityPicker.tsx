import type { Priority } from '@/types';
import { LABELS } from '@/config/labels';
import styles from './PriorityPicker.module.css';

const LEVELS: Priority[] = ['none', 'low', 'medium', 'high'];
const L = LABELS.priority;

// A priority as a traffic light (asked for by the user 2026-11-05: the words took the width a due
// time needed): a dot per level, the chosen one filled and named beside them, so colour is never
// the only signal. Arrow keys move between the dots, as in any group of radio buttons.
export function PriorityPicker({ value, onChange, id }: { value: Priority; onChange: (p: Priority) => void; id?: string }) {
  const move = (step: number) => {
    const next = LEVELS[(LEVELS.indexOf(value) + step + LEVELS.length) % LEVELS.length];
    onChange(next);
    requestAnimationFrame(() => document.getElementById(`${id ?? 'priority'}-${next}`)?.focus());
  };
  return (
    <div className={styles.picker}>
      <div
        className={styles.dots}
        role="radiogroup"
        aria-label={L.label}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        }}
      >
        {LEVELS.map((p) => (
          <button
            key={p}
            id={`${id ?? 'priority'}-${p}`}
            type="button"
            role="radio"
            aria-checked={value === p}
            aria-label={L.levels[p]}
            title={L.levels[p]}
            tabIndex={value === p ? 0 : -1}
            data-level={p}
            className={styles.dot}
            onClick={() => onChange(p)}
          />
        ))}
      </div>
      <span className={styles.name} aria-hidden="true">{L.levels[value]}</span>
    </div>
  );
}
