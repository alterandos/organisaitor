import { useUIStore } from '@/store/uiStore';
import { CORE_NAV_ITEMS } from '@/components/NavSidebar/NavSidebar';
import styles from './MobileNav.module.css';

// Android-only bottom tab bar (docs/android/00-architecture.md §5b, corrected tab list).
// Deliberately only the four Organizer sections + More — Notes/Portfolio/Fitness live in
// MobileMoreSheet regardless of tier, so Notes moving between free/paid (ADR-4) never
// touches this component. This is separate from NavSidebar's own `@media` narrow-browser
// collapse (which shows all 7 sections) — the two never render at once, since App.tsx
// renders NavSidebar only when !isAndroid.
const TAB_VIEWS = ['tasks', 'calendar', 'records', 'lists'] as const;
const TABS = CORE_NAV_ITEMS.filter((item) => (TAB_VIEWS as readonly string[]).includes(item.view));

const MoreIcon = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <circle cx="5"  cy="11" r="1.6" fill="currentColor"/>
    <circle cx="11" cy="11" r="1.6" fill="currentColor"/>
    <circle cx="17" cy="11" r="1.6" fill="currentColor"/>
  </svg>
);

export function MobileNav() {
  const activeView           = useUIStore((s) => s.activeView);
  const setActiveView        = useUIStore((s) => s.setActiveView);
  const mobileMoreSheetOpen  = useUIStore((s) => s.mobileMoreSheetOpen);
  const openMobileMoreSheet  = useUIStore((s) => s.openMobileMoreSheet);

  const moreActive = mobileMoreSheetOpen
    || activeView === 'notes' || activeView === 'portfolio' || activeView === 'fitness';

  return (
    <nav className={styles.bar} aria-label="App navigation">
      {TABS.map((item) => (
        <button
          key={item.view}
          className={`${styles.tab} ${activeView === item.view ? styles.tabActive : ''}`}
          onClick={() => {
            if (activeView === item.view) window.scrollTo({ top: 0, behavior: 'smooth' });
            else setActiveView(item.view);
          }}
          aria-label={item.label}
          aria-current={activeView === item.view ? 'page' : undefined}
        >
          {item.icon}
          {activeView === item.view && <span className={styles.tabLabel}>{item.label}</span>}
        </button>
      ))}
      <button
        className={`${styles.tab} ${moreActive ? styles.tabActive : ''}`}
        onClick={openMobileMoreSheet}
        aria-label="More"
        aria-haspopup="true"
        aria-expanded={mobileMoreSheetOpen}
      >
        {MoreIcon}
        {moreActive && <span className={styles.tabLabel}>More</span>}
      </button>
    </nav>
  );
}
