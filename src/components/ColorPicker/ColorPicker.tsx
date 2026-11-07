import { SWATCH_HEXES, SWATCH_PALES, swatchLabel } from '@/config/swatches';
import { TextColorIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import styles from './ColorPicker.module.css';

// THE colour picker (CLAUDE.md "Colours a person picks"): the suite's palette, then Custom… for any
// colour at all (the user, 2026-11-07), through the system's own colour chooser. A colour picked
// outside the palette shows on the Custom swatch, selected.

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
  palette?: 'standard' | 'light';
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorPicker({ value, onChange, palette = 'standard' }: Props) {
  const colors = palette === 'light' ? SWATCH_PALES : SWATCH_HEXES;
  const custom = value && !colors.some((c) => c.toLowerCase() === value.toLowerCase()) ? value : null;
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
      <label className={`${styles.swatch} ${styles.custom} ${custom ? styles.selected : ''}`} style={custom ? { background: custom } : undefined} title={LABELS.colorPicker.custom}>
        {!custom && <TextColorIcon className={styles.wheel} />}
        <input
          type="color"
          className={styles.customInput}
          aria-label={LABELS.colorPicker.custom}
          value={custom && HEX.test(custom) ? custom : '#6366f1'}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
