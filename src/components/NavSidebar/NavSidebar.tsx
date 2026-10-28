import { useUIStore } from '@/store/uiStore';
import { isAppEnabled } from '@/config/apps';
import styles from './NavSidebar.module.css';
import { Fragment } from 'react';
import { SECTIONS } from '@/config/sections';
import { SECTION_ICONS } from './navItems';
import { IntegrationsIcon } from '@/components/Icons';

export function NavSidebar() {
  const activeView        = useUIStore((s) => s.activeView);
  const setActiveView     = useUIStore((s) => s.setActiveView);
  const integrationsOpen  = useUIStore((s) => s.integrationsOpen);
  const openIntegrations  = useUIStore((s) => s.openIntegrations);
  const visible = SECTIONS.filter((sec) => isAppEnabled(sec.view));
  const groups = (['top', 'core', 'extras'] as const).map((g) => visible.filter((sec) => sec.group === g)).filter((g) => g.length > 0);

  return (
    <nav className={styles.sidebar} aria-label="App navigation">
      {/* The sections in their groups, from the registry (config/sections.ts), a line between groups. */}
      {groups.map((group, i) => (
        <Fragment key={group[0].group}>
          {i > 0 && <hr className={styles.sectionDivider} aria-hidden="true" />}
          {group.map((sec) => (
            <button
              key={sec.view}
              className={`${styles.navBtn} ${activeView === sec.view ? styles.navBtnActive : ''}`}
              onClick={() => setActiveView(sec.view)}
              title={sec.label}
              aria-label={sec.label}
              aria-current={activeView === sec.view ? 'page' : undefined}
            >
              {SECTION_ICONS[sec.view]}
            </button>
          ))}
        </Fragment>
      ))}

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
