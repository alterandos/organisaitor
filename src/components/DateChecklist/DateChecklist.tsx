import { useState } from 'react';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import styles from './DateChecklist.module.css';

// THE list of a series' dates with a box each (adopted 2026-11-07, when three had been built: a
// Schedule's skip list, the dates a task links to, a repeat's Leave out dates). The caller says what
// a tick means and keeps the dates; this draws them, a page at a time ("Show N more"), each with an
// optional note, a locked date shown but not to be changed.
export interface DateChecklistProps {
  dates:     string[];
  checked:   (date: string) => boolean;
  onToggle:  (date: string) => void;
  // A date that can't be changed here, with why ("linked", "time off", "changed").
  locked?:   ReadonlyMap<string, string>;
  label:     string;
  // How many show at first and each "Show more" adds; all of them when absent.
  pageSize?: number;
}

export function DateChecklist({ dates, checked, onToggle, locked, label, pageSize }: DateChecklistProps) {
  const [shown, setShown] = useState(pageSize ?? dates.length);
  const visible = pageSize ? dates.slice(0, shown) : dates;
  return (
    <>
      <ul className={styles.list} aria-label={label}>
        {visible.map((d) => (
          <li key={d}>
            <label className={styles.row}>
              <input type="checkbox" checked={checked(d)} disabled={locked?.has(d)} onChange={() => onToggle(d)} />
              <span>{formatDate(d + 'T00:00:00')}</span>
              {locked?.has(d) && <span className={styles.note}>{locked.get(d)}</span>}
            </label>
          </li>
        ))}
      </ul>
      {pageSize && dates.length > shown && (
        <button type="button" className={styles.more} onClick={() => setShown((n) => n + pageSize)}>
          {LABELS.dateChecklist.more(Math.min(pageSize, dates.length - shown))}
        </button>
      )}
    </>
  );
}
