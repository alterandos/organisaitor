import { WatchlistView } from '@/components/WatchlistView/WatchlistView';
import styles from './PortfolioSection.module.css';

// Wrapper for all Portfolio sub-views. Currently only Watchlist exists;
// add sub-nav tabs here when Portfolio and News views are built.
export function PortfolioSection() {
  return (
    <div className={styles.container}>
      <WatchlistView />
    </div>
  );
}
