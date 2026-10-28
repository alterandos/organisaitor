import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { isAppEnabled } from '@/config/apps';
import { SECTIONS } from '@/config/sections';
import styles from './MobileMoreSheet.module.css';
import { BottomSheet } from '@/components/BottomSheet/BottomSheet';

// Android-only bottom sheet for the overflow of MobileNav's 4-tab bar. Notes/Portfolio/
// Fitness live here regardless of monetization tier (docs/android/00-architecture.md §5b) —
// deliberately decoupled from tier so Notes moving free/paid later never touches this list.
// Manage Library is also routed here since its desktop trigger (hover the header hamburger)
// has no touch equivalent.
export function MobileMoreSheet() {
  const isOpen         = useUIStore((s) => s.mobileMoreSheetOpen);
  const close           = useUIStore((s) => s.closeMobileMoreSheet);
  const setActiveView  = useUIStore((s) => s.setActiveView);
  const openManage      = useUIStore((s) => s.openManage);
  const openSettings    = useUIStore((s) => s.openSettings);
  const openAccount     = useUIStore((s) => s.openAccount);

  if (!isOpen) return null;

  const go = (fn: () => void) => { fn(); close(); };

  return (
    <BottomSheet onClose={close} ariaLabel="More">
      {/* Every section not in the tab bar (config/sections.ts), in nav order. */}
      {SECTIONS.filter((sec) => !sec.tab && isAppEnabled(sec.view)).map((sec) => (
        <button key={sec.view} className={styles.item} onClick={() => go(() => setActiveView(sec.view))}>
          {sec.label}
        </button>
      ))}

      <div className={styles.divider} />

      <button className={styles.item} onClick={() => go(() => useUIStore.getState().openHistoryBrowser())}>
        {LABELS.history.moreLabel}
      </button>
      <button className={styles.item} onClick={() => go(() => openManage())}>
        {LABELS.places.manage}
      </button>
      <button className={styles.item} onClick={() => go(openSettings)}>
        {LABELS.places.settings}
      </button>
      <button className={styles.item} onClick={() => go(() => openAccount())}>
        {LABELS.places.account}
      </button>
    </BottomSheet>
  );
}
