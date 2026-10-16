import { LABELS } from '@/config/labels';
import { formatStorageSize, getStorageUsage } from '@/utils/persistStorage';
import { getIdbUsage } from '@/utils/idbStorage';
import styles from './SettingsPane.module.css';

const SHOWN = 5;

// Everything the app stores on this device: localStorage entries plus the IndexedDB-backed ones.
const allUsage = () => [
  ...getStorageUsage().map((u) => ({ ...u, where: 'localStorage' as const })),
  ...getIdbUsage(),
].sort((a, b) => b.chars - a.chars);

// Settings → Storage: how much of the browser's localStorage each part of the app is using (the
// whole site gets roughly 5 MB, though notes live in IndexedDB now — see utils/persistStorage.ts and
// utils/idbStorage.ts).
export function StorageSection() {
  const L = LABELS.storage;
  const usage = allUsage();

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>{L.section}</h3>

      <div className={styles.setting}>
        <div className={styles.settingInfo}>
          <span className={styles.settingName}>{L.usageName}</span>
          <span className={styles.settingDesc}>{L.usageDesc}</span>
        </div>
        <ul className={styles.usageList}>
          {usage.slice(0, SHOWN).map((u) => (
            <li key={u.key} className={styles.usageRow}>
              <span>{u.label}{u.where === 'database' ? ` (${L.inDatabase})` : ''}</span>
              <span className={styles.usageSize}>{formatStorageSize(u.chars)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
