import { useUIStore } from '@/store/uiStore';
import type { AppView } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import styles from './NavSidebar.module.css';

const NAV_ITEMS: { view: AppView; label: string; icon: React.ReactNode }[] = [
  {
    view: 'tasks',
    label: LABELS.views.tasks,
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M5 7h12M5 11h12M5 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="3" cy="7"  r="1" fill="currentColor"/>
        <circle cx="3" cy="11" r="1" fill="currentColor"/>
        <circle cx="3" cy="15" r="1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    view: 'calendar',
    label: LABELS.views.calendar,
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M3 9h16" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M8 3v4M14 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="8"  cy="13" r="1" fill="currentColor"/>
        <circle cx="11" cy="13" r="1" fill="currentColor"/>
        <circle cx="14" cy="13" r="1" fill="currentColor"/>
        <circle cx="8"  cy="16" r="1" fill="currentColor"/>
        <circle cx="11" cy="16" r="1" fill="currentColor"/>
      </svg>
    ),
  },
];

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
      {NAV_ITEMS.map((item) => (
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
