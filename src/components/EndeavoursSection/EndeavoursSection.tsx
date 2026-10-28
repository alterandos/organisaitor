import { useUIStore } from '@/store/uiStore';
import type { CollectionId } from '@/types';
import { EndeavoursPage } from './EndeavoursPage';
import { EndeavourHome } from './EndeavourHome';
import styles from './EndeavoursSection.module.css';

// The Endeavours section (docs/features/endeavours.md phase 2): the page of every Endeavour, or the
// home of the one open (uiStore.endeavourHomeId, remembered across reloads; each home a history stop).
export function EndeavoursSection() {
  const homeId = useUIStore((s) => s.endeavourHomeId);
  return (
    <main className={styles.section}>
      {homeId ? <EndeavourHome key={homeId} id={homeId as CollectionId} /> : <EndeavoursPage />}
    </main>
  );
}
