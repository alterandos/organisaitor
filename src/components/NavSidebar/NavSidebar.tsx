import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { isAppEnabled } from '@/config/apps';
import styles from './NavSidebar.module.css';
import { CORE_NAV_ITEMS, OverviewIcon, PortfolioIcon, FitnessIcon } from './navItems';

const IntegrationsIcon = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <path d="M11 3v6M8 6l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 13h4v4a1 1 0 001 1h6a1 1 0 001-1v-4h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export function NavSidebar() {
  const activeView        = useUIStore((s) => s.activeView);
  const setActiveView     = useUIStore((s) => s.setActiveView);
  const integrationsOpen  = useUIStore((s) => s.integrationsOpen);
  const openIntegrations  = useUIStore((s) => s.openIntegrations);

  return (
    <nav className={styles.sidebar} aria-label="App navigation">
      <button
        className={`${styles.navBtn} ${activeView === 'overview' ? styles.navBtnActive : ''}`}
        onClick={() => setActiveView('overview')}
        title={LABELS.views.overview}
        aria-label={LABELS.views.overview}
        aria-current={activeView === 'overview' ? 'page' : undefined}
      >
        {OverviewIcon}
      </button>
      <hr className={styles.sectionDivider} aria-hidden="true" />

      {CORE_NAV_ITEMS.map((item) => (
        <button
          key={item.view}
          className={`${styles.navBtn} ${activeView === item.view ? styles.navBtnActive : ''}`}
          onClick={() => setActiveView(item.view)}
          title={item.label}
          aria-label={item.label}
          aria-current={activeView === item.view ? 'page' : undefined}
        >
          {item.icon}
        </button>
      ))}

      {(isAppEnabled('portfolio') || isAppEnabled('fitness')) && (
        <hr className={styles.sectionDivider} aria-hidden="true" />
      )}

      {isAppEnabled('portfolio') && (
        <button
          className={`${styles.navBtn} ${activeView === 'portfolio' ? styles.navBtnActive : ''}`}
          onClick={() => setActiveView('portfolio')}
          title={LABELS.views.portfolio}
          aria-label={LABELS.views.portfolio}
          aria-current={activeView === 'portfolio' ? 'page' : undefined}
        >
          {PortfolioIcon}
        </button>
      )}

      {isAppEnabled('fitness') && (
        <button
          className={`${styles.navBtn} ${activeView === 'fitness' ? styles.navBtnActive : ''}`}
          onClick={() => setActiveView('fitness')}
          title={LABELS.views.fitness}
          aria-label={LABELS.views.fitness}
          aria-current={activeView === 'fitness' ? 'page' : undefined}
        >
          {FitnessIcon}
        </button>
      )}

      <div className={styles.spacer} />

      <button
        className={`${styles.navBtn} ${integrationsOpen ? styles.navBtnUtilOpen : ''}`}
        onClick={openIntegrations}
        title="Data & Integrations"
        aria-label="Data & Integrations"
      >
        {IntegrationsIcon}
      </button>
    </nav>
  );
}
