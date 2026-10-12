import { SWATCH_HEXES, SWATCH_PALES, swatchLabel } from '@/config/swatches';
import styles from './ColorPicker.module.css';

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
  palette?: 'standard' | 'light';
}

export function ColorPicker({ value, onChange, palette = 'standard' }: Props) {
  const colors = palette === 'light' ? SWATCH_PALES : SWATCH_HEXES;
  return (
    <div className={styles.swatches}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`${styles.swatch} ${value === c ? styles.selected : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c === value ? null : c)}
          aria-label={swatchLabel(c)}
          title={swatchLabel(c)}
        />
      ))}
    </div>
  );
}
