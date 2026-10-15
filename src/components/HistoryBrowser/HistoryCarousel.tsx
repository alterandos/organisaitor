import type { NavPlace } from '@/store/navHistory';
import { LABELS } from '@/config/labels';
import { formatRelativeTime } from '@/utils/date';
import type { PlaceSummary } from './describePlace';
import { PlaceCard, PlaceCardBadge } from './PlaceCard';
import styles from './HistoryCarousel.module.css';

// THE history carousel: places as cards, the selected one in the middle, the others fanned out
// either side. Drawn by the history browser (Alt+N, full size, cards you can pick) and by the
// back/forward flash (Alt+← / Alt+→, compact and display-only: NavFlash). Each card is placed from
// its distance to the centred one (--d, --ad, --s), so moving is one transition.

export interface HistoryCard { place: NavPlace; offset: number }   // offset: steps from where you are

export function HistoryCarousel({ cards, summaries, sel, visible, compact, onPick }: {
  cards:     HistoryCard[];
  summaries: PlaceSummary[];
  sel:       number;
  visible:   number;          // cards drawn either side of the centred one
  compact?:  boolean;
  onPick?:   (i: number) => void;
}) {
  return (
    <div className={`${styles.stage} ${compact ? styles.compact : ''}`}>
      {cards.map((card, i) => {
        const d = i - sel;
        if (Math.abs(d) > visible) return null;
        const { place, offset } = card;
        return (
          <PlaceCard
            key={i}
            place={place}
            summary={summaries[i]}
            selected={d === 0}
            className={styles.card}
            style={{ ['--d' as string]: d, ['--ad' as string]: Math.abs(d), ['--s' as string]: Math.sign(d) }}
            onClick={onPick ? () => onPick(i) : undefined}
            badge={offset === 0
              ? <PlaceCardBadge here>{LABELS.history.here}</PlaceCardBadge>
              : <PlaceCardBadge>{offset > 0 ? LABELS.history.forward : formatRelativeTime(place.at)}</PlaceCardBadge>}
            footer={onPick && d === 0 && offset !== 0 ? <>{LABELS.history.open} ↵</> : undefined}
          />
        );
      })}
    </div>
  );
}
