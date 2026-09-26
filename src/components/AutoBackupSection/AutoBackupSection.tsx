import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { listBackupSnapshots, getBackupSnapshot, type BackupSnapshotMeta } from '@/services/autoBackupStorage';
import { restoreBackupData } from '@/utils/backupExport';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import styles from './AutoBackupSection.module.css';

// The UI half of services/autoBackup.ts — shown in AccountPane (both signed-in and guest
// branches, since this feature needs no account) alongside the existing manual Export/Restore.
// A snapshot restored from here goes through the exact same restoreBackupData() the manual
// file-restore uses (utils/backupExport.ts) — one restore path, not two that can drift apart.
export function AutoBackupSection() {
  const enabled       = useSettingsStore((s) => s.autoBackupEnabled);
  const setEnabled    = useSettingsStore((s) => s.setAutoBackupEnabled);
  const threshold      = useSettingsStore((s) => s.autoBackupChangeThreshold);
  const setThreshold   = useSettingsStore((s) => s.setAutoBackupChangeThreshold);
  const maxCount       = useSettingsStore((s) => s.autoBackupMaxCount);
  const user = useAuthStore((s) => s.user);

  const [snapshots,   setSnapshots]   = useState<BackupSnapshotMeta[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [message,     setMessage]     = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setSnapshots(await listBackupSnapshots());
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the snapshot list from IndexedDB (an external system) once, on mount
  useEffect(() => { void refresh(); }, []);

  const handleRestore = async (id: number, createdAt: string) => {
    const when = new Date(createdAt).toLocaleString();
    const ok = await confirmDialog({
      title:        'Restore this automatic backup?',
      message:      `This replaces your current data with the snapshot from ${when}. The app will reload.`,
      confirmLabel: 'Restore',
      destructive:  true,
      irreversible: true,
    });
    if (!ok) return;
    setRestoringId(id);
    setMessage(null);
    try {
      const raw = await getBackupSnapshot(id);
      if (!raw) throw new Error('This snapshot could not be read.');
      const backup = JSON.parse(raw) as Record<string, unknown>;
      await restoreBackupData(backup, user?.id ?? null);
      setMessage('Restored. Reloading…');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Restore failed.');
      setRestoringId(null);
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>Automatic local backups</span>
        <label className={styles.toggle}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>
      <p className={styles.desc}>
        Saves a snapshot on this device once enough has changed — no account needed, nothing leaves your device. Keeps up to {maxCount}, spaced out over time (recent ones dense, older ones sparse).
      </p>
      {enabled && (
        <label className={styles.thresholdRow}>
          Snapshot after
          <input
            type="number"
            className={styles.thresholdInput}
            min={5}
            max={500}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          changes
        </label>
      )}
      {message && <p className={styles.message}>{message}</p>}
      {loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : snapshots.length === 0 ? (
        <p className={styles.empty}>No automatic snapshots yet.</p>
      ) : (
        <ul className={styles.list}>
          {snapshots.map((s) => (
            <li key={s.id} className={styles.row}>
              <span className={styles.rowDate}>{new Date(s.createdAt).toLocaleString()}</span>
              <button
                className={styles.restoreBtn}
                onClick={() => handleRestore(s.id, s.createdAt)}
                disabled={restoringId !== null}
                type="button"
              >
                {restoringId === s.id ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
