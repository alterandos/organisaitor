import { useId } from 'react';
import { LABELS } from '@/config/labels';
import { ITEM_FLAG_ICON } from '@/config/itemIcons';
import { showAsChoices, type ShowAs } from '@/utils/showAs';
import styles from './ShowAsField.module.css';

const ICON: Record<ShowAs, string> = { normal: '', quiet: ITEM_FLAG_ICON.quiet, background: ITEM_FLAG_ICON.background };

// "Show as" (utils/showAs.ts): Normal, Quiet, and Background for an event over several days. A
// row of radio buttons, in the create form and the event pane alike.
export function ShowAsField({ value, onChange, multiDay }: { value: ShowAs; onChange: (v: ShowAs) => void; multiDay: boolean }) {
  const L = LABELS.calendarForm.showAs;
  const labelId = useId();
  return (
    <div className={styles.field}>
      <span className={styles.label} id={labelId}>{L.label}</span>
      <div className={styles.choices} role="radiogroup" aria-labelledby={labelId}>
        {showAsChoices(multiDay).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} title={L.hints[v]}
            className={`${styles.choice} ${value === v ? styles.on : ''}`} onClick={() => onChange(v)}>
            {ICON[v] && <span aria-hidden="true">{ICON[v]}</span>}{L.choices[v]}
          </button>
        ))}
      </div>
    </div>
  );
}
