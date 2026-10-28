import { DateInput } from '@/components/DateInput/DateInput';
import type { FieldSchema } from '@/types';
import styles from './FieldInput.module.css';

// THE input for one FieldSchema field (a tracker's columns, a Type's fields): one way to fill in
// each kind of field wherever fields are filled in.
interface FieldInputProps {
  field: FieldSchema;
  value: unknown;
  onChange: (val: unknown) => void;
}

export function FieldInput({ field, value, onChange }: FieldInputProps) {
  switch (field.type) {
    case 'boolean': {
      const isOn = Boolean(value);
      return (
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          className={`${styles.toggleRow} ${isOn ? styles.toggleRowOn : ''}`}
          onClick={() => onChange(!isOn)}
        >
          <div className={`${styles.toggleTrack} ${isOn ? styles.toggleTrackOn : ''}`}>
            <div className={`${styles.toggleThumb} ${isOn ? styles.toggleThumbOn : ''}`} />
          </div>
          <span className={styles.toggleLabel}>{field.name}</span>
          {isOn && <span className={styles.toggleCheck}>✓</span>}
        </button>
      );
    }

    case 'rating': {
      const max = field.max ?? 5;
      const current = Number(value) || 0;
      return (
        <div className={styles.ratingRow}>
          {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
            <button
              key={star}
              type="button"
              className={`${styles.ratingStar} ${star <= current ? styles.ratingStarActive : ''}`}
              onClick={() => onChange(star === current ? 0 : star)}
            >
              ★
            </button>
          ))}
        </div>
      );
    }

    case 'select':
      return (
        <select
          className={styles.select}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'number':
      return (
        <input
          className={styles.input}
          type="number"
          value={value === null || value === undefined ? '' : String(value)}
          placeholder={field.unit ? `Value (${field.unit})` : 'Value'}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );

    case 'date':
      return (
        <DateInput className={styles.input} value={String(value ?? '')} onChange={(v) => onChange(v || null)} />
      );

    case 'duration': {
      const totalSecs = Number(value) || 0;
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      return (
        <div className={styles.durationRow}>
          <input
            className={styles.durationInput}
            type="number"
            min={0}
            value={totalSecs === 0 && h === 0 ? '' : h}
            placeholder="0"
            onChange={(e) => {
              const newH = Math.max(0, Number(e.target.value) || 0);
              onChange(newH * 3600 + m * 60 + s);
            }}
          />
          <span className={styles.durationLabel}>h</span>
          <input
            className={styles.durationInput}
            type="number"
            min={0}
            max={59}
            value={totalSecs === 0 && m === 0 ? '' : m}
            placeholder="0"
            onChange={(e) => {
              const newM = Math.min(59, Math.max(0, Number(e.target.value) || 0));
              onChange(h * 3600 + newM * 60 + s);
            }}
          />
          <span className={styles.durationLabel}>m</span>
          <input
            className={styles.durationInput}
            type="number"
            min={0}
            max={59}
            value={totalSecs === 0 && s === 0 ? '' : s}
            placeholder="0"
            onChange={(e) => {
              const newS = Math.min(59, Math.max(0, Number(e.target.value) || 0));
              onChange(h * 3600 + m * 60 + newS);
            }}
          />
          <span className={styles.durationLabel}>s</span>
        </div>
      );
    }

    case 'url':
      return (
        <input
          className={styles.input}
          type="url"
          value={String(value ?? '')}
          placeholder="https://"
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    default: // 'text'
      return (
        <input
          className={styles.input}
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
