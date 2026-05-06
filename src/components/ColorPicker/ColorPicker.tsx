import styles from './ColorPicker.module.css';

const STANDARD_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#ec4899', '#f43f5e', '#64748b',
];

const LIGHT_COLORS = [
  '#fca5a5', '#fdba74', '#fcd34d', '#fde047',
  '#bef264', '#86efac', '#6ee7b7', '#99f6e4',
  '#67e8f9', '#93c5fd', '#a5b4fc', '#c4b5fd',
  '#d8b4fe', '#f9a8d4', '#fda4af', '#cbd5e1',
];

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
  palette?: 'standard' | 'light';
}

export function ColorPicker({ value, onChange, palette = 'standard' }: Props) {
  const colors = palette === 'light' ? LIGHT_COLORS : STANDARD_COLORS;
  return (
    <div className={styles.swatches}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`${styles.swatch} ${value === c ? styles.selected : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c === value ? null : c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}
