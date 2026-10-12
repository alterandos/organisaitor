import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { isAppEnabled } from '@/config/apps';
import styles from './NavSidebar.module.css';
import { CORE_NAV_ITEMS, OverviewIcon, PortfolioIcon, FitnessIcon } from './navItems';
import { IntegrationsIcon } from '@/components/Icons';

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
        <IntegrationsIcon width={22} height={22} />
      </button>
    </nav>
  );
}
