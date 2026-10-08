import { LABELS } from '@/config/labels';
import type { RepeatConfig, RepeatFreq } from '@/types';
import styles from './RepeatField.module.css';

interface Props {
  value:    RepeatConfig | null;
  onChange: (repeat: RepeatConfig | null) => void;
  hint?:    string;
}

const FREQS: RepeatFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const DEFAULT: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };

// A repeat rule: on/off, every N days/weeks/months/years, ending never / after N times / on a
// date. Controlled: every change hands back the whole rule (null = doesn't repeat). Used by the
// task pane and the add-task modal; the calendar panes have their own copies (BACKLOG.md
// "Pattern retrofit backlog").
export function RepeatField({ value, onChange, hint }: Props) {
  const L = LABELS.recurring;
  const set = (patch: Partial<RepeatConfig>) => onChange({ ...(value ?? DEFAULT), ...patch });
  return (
    <div className={styles.field}>
      <label className={styles.toggle}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? { ...DEFAULT } : null)} />
        {L.repeat}
      </label>
      {value && (
        <div className={styles.config}>
          <div className={styles.row}>
            <span className={styles.small}>{L.every}</span>
            <input
              type="number"
              className={styles.num}
              min={1}
              value={value.interval}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <select className={styles.select} value={value.freq} onChange={(e) => set({ freq: e.target.value as RepeatFreq })}>
              {FREQS.map((f) => <option key={f} value={f}>{L.units[f][value.interval === 1 ? 0 : 1]}</option>)}
            </select>
          </div>
          <div className={styles.row}>
            <span className={styles.small}>{L.ends}</span>
            <select
              className={styles.select}
              value={value.endKind}
              onChange={(e) => {
                const endKind = e.target.value as RepeatConfig['endKind'];
                set({ endKind, count: endKind === 'count' ? value.count ?? 10 : null, until: endKind === 'until' ? value.until : null });
              }}
            >
              <option value="forever">{L.endNever}</option>
              <option value="count">{L.endCount}</option>
              <option value="until">{L.endUntil}</option>
            </select>
            {value.endKind === 'count' && (
              <input
                type="number"
                className={styles.num}
                min={1}
                value={value.count ?? 10}
                onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })}
              />
            )}
            {value.endKind === 'until' && (
              <input type="date" className={styles.date} value={value.until ?? ''} onChange={(e) => set({ until: e.target.value || null })} />
            )}
          </div>
          {hint && <p className={styles.hint}>{hint}</p>}
        </div>
      )}
    </div>
  );
}
