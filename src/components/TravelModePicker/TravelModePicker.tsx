import type { TravelMode } from '@/types';
import { TRAVEL_MODES } from '@/config/calendarEventTypes';
import { LABELS } from '@/config/labels';
import styles from './TravelModePicker.module.css';

interface Props {
  value:    TravelMode | null;
  onChange: (mode: TravelMode | null) => void;
}

// How a travel event travels (flight, train, …). Choosing the one already chosen clears it.
export function TravelModePicker({ value, onChange }: Props) {
  return (
    <div className={styles.row} role="group" aria-label={LABELS.travelMode.heading}>
      {TRAVEL_MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          className={`${styles.mode} ${value === m.value ? styles.on : ''}`}
          aria-pressed={value === m.value}
          onClick={() => onChange(value === m.value ? null : m.value)}
        >
          <span aria-hidden="true">{m.icon}</span>
          {m.label}
        </button>
      ))}
    </div>
  );
}
