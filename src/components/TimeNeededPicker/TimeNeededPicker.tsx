import type { TimeIntensity } from '@/types';
import { LABELS } from '@/config/labels';
import { TimeNeededIcon } from '@/components/Icons';
import styles from './TimeNeededPicker.module.css';

const LEVELS: (TimeIntensity | null)[] = [null, 'low', 'medium', 'high'];
const L = LABELS.timeNeeded;
const keyOf = (v: TimeIntensity | null) => v ?? 'none';

// How much time a task needs (the field `timeIntensity`; renamed for people 2026-11-06), built as
// PriorityPicker is so the two sit side by side: an empty clock for "not set", then clocks a third,
// two thirds and wholly filled, the chosen one ringed and named beside them (so colour is never the
// only signal). Arrow keys move between them, as in any group of radio buttons.
export function TimeNeededPicker({ value, onChange, id }: { value: TimeIntensity | null; onChange: (v: TimeIntensity | null) => void; id?: string }) {
  const move = (step: number) => {
    const next = LEVELS[(LEVELS.indexOf(value) + step + LEVELS.length) % LEVELS.length];
    onChange(next);
    requestAnimationFrame(() => document.getElementById(`${id ?? 'time-needed'}-${keyOf(next)}`)?.focus());
  };
  return (
    <div className={styles.picker}>
      <div
        className={styles.clocks}
        role="radiogroup"
        aria-label={L.label}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        }}
      >
        {LEVELS.map((v, i) => (
          <button
            key={keyOf(v)}
            id={`${id ?? 'time-needed'}-${keyOf(v)}`}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={L.levels[keyOf(v)]}
            title={L.levels[keyOf(v)]}
            tabIndex={value === v ? 0 : -1}
            data-level={keyOf(v)}
            className={styles.clock}
            onClick={() => onChange(v)}
          >
            <TimeNeededIcon level={i as 0 | 1 | 2 | 3} />
          </button>
        ))}
      </div>
      <span className={styles.name} aria-hidden="true">{L.levels[keyOf(value)]}</span>
    </div>
  );
}
