import { TimeInput } from '@/components/TimeInput/TimeInput';
import styles from './AllDayNotifyField.module.css';

interface Props {
  daysBefore: number;
  atTime:     string;
  onChange:   (daysBefore: number, atTime: string) => void;
}

const DAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 14];

const dayLabel = (n: number) => (n === 0 ? 'On the day' : n === 1 ? '1 day before' : `${n} days before`);

// "When should I be told about this?" for a reminder that has a date but no time.
export function AllDayNotifyField({ daysBefore, atTime, onChange }: Props) {
  const options = DAY_OPTIONS.includes(daysBefore) ? DAY_OPTIONS : [...DAY_OPTIONS, daysBefore].sort((a, b) => a - b);
  return (
    <div className={styles.row}>
      <select
        className={styles.select}
        value={daysBefore}
        onChange={(e) => onChange(Number(e.target.value), atTime)}
        aria-label="Days before"
      >
        {options.map((n) => <option key={n} value={n}>{dayLabel(n)}</option>)}
      </select>
      <span className={styles.at}>at</span>
      <TimeInput value={atTime} onChange={(v) => onChange(daysBefore, v || atTime)} />
    </div>
  );
}
