import type { CSSProperties, ReactNode } from 'react';
import type { NavPlace } from '@/store/navHistory';
import { SECTION_ICONS } from '@/components/NavSidebar/navItems';
import { LABELS } from '@/config/labels';
import type { PlaceSummary } from './describePlace';
import styles from './PlaceCard.module.css';

// One place as a card: section band (icon, name, and `badge` on the right), then where it sits,
// its title, a detail and a preview of its text. The history browser's carousel and the phone's
// recent notes (MobileNotes) both draw it; each places and sizes it with `className`.

export function PlaceCard({ place, summary, badge, footer, selected, className, style, onClick }: {
  place:      NavPlace;
  summary:    PlaceSummary;
  badge?:     ReactNode;
  footer?:    ReactNode;
  selected?:  boolean;
  className?: string;
  style?:     CSSProperties;
  onClick?:   () => void;
}) {
  return (
    <article
      className={[styles.card, selected ? styles.cardSel : '', summary.removed ? styles.cardRemoved : '', className ?? ''].filter(Boolean).join(' ')}
      data-view={place.view}
      style={style}
      aria-current={selected || undefined}
      onClick={onClick}
    >
      <div className={styles.band}>
        <span className={styles.sectionIcon} aria-hidden="true">{SECTION_ICONS[place.view]}</span>
        <span className={styles.section}>{LABELS.views[place.view]}</span>
        {badge}
      </div>
      <div className={styles.body}>
        {summary.path.length > 0 && <div className={styles.path}>{summary.path.join(' › ')}</div>}
        <h3 className={styles.cardTitle}>{summary.title}</h3>
        {summary.detail && <div className={styles.detail}>{summary.detail}</div>}
        {summary.preview && <p className={styles.preview}>{summary.preview}</p>}
      </div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </article>
  );
}

// The right-hand end of a card's band: a time ("2 hours ago"), or the highlighted "You are here".
export function PlaceCardBadge({ children, here }: { children: ReactNode; here?: boolean }) {
  return <span className={here ? styles.badgeHere : styles.when}>{children}</span>;
}
