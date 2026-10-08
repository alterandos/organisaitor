import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { isAppEnabled } from '@/config/apps';
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
      <button className={styles.item} onClick={() => go(() => setActiveView('overview'))}>
        {LABELS.views.overview}
      </button>
      <button className={styles.item} onClick={() => go(() => setActiveView('notes'))}>
        {LABELS.views.notes}
      </button>
      {isAppEnabled('portfolio') && (
        <button className={styles.item} onClick={() => go(() => setActiveView('portfolio'))}>
          {LABELS.views.portfolio}
        </button>
      )}
      {isAppEnabled('fitness') && (
        <button className={styles.item} onClick={() => go(() => setActiveView('fitness'))}>
          {LABELS.views.fitness}
        </button>
      )}

      <div className={styles.divider} />

      <button className={styles.item} onClick={() => go(() => useUIStore.getState().openHistoryBrowser())}>
        {LABELS.history.moreLabel}
      </button>
      <button className={styles.item} onClick={() => go(() => openManage())}>
        Manage Library
      </button>
      <button className={styles.item} onClick={() => go(openSettings)}>
        Settings
      </button>
      <button className={styles.item} onClick={() => go(openAccount)}>
        Account
      </button>
    </BottomSheet>
  );
}
