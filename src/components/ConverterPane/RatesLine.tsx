import { useCurrencyRates } from '@/services/currencyRates';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import styles from './ConvertWidget.module.css';

// Under a currency conversion: whose rates it uses and from when, and (in a note) keeping them or
// going back to today's. Shown by the note card and the Converters place.

const L = LABELS.converters.rates;
const day = (iso: string) => formatDate(iso + 'T00:00:00');

export function RatesLine({ fixed, editable, onKeep, onLive }: {
  fixed: { date: string } | null;
  editable: boolean;
  onKeep?: () => void;
  onLive?: () => void;
}) {
  const { rates, loading, failed } = useCurrencyRates(!fixed);
  const text = fixed ? L.kept(day(fixed.date))
    : rates ? (failed ? L.stale(day(rates.date)) : L.from(day(rates.date)))
    : loading ? L.loading : L.none;
  return (
    <span className={styles.rates}>
      {text}
      {editable && fixed && onLive && <button type="button" className={styles.ratesBtn} onClick={onLive}>{L.live}</button>}
      {editable && !fixed && onKeep && <button type="button" className={styles.ratesBtn} onClick={onKeep} title={L.keepHint}>{L.keep}</button>}
    </span>
  );
}
