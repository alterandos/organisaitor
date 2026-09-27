import { PERSISTED_STORAGE_KEYS } from '@/config/backup';
import { readPersistedValue, writePersistedValue } from '@/utils/idbStorage';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrackerStore } from '@/store/trackerStore';
import { forceUpload } from '@/services/sync/syncService';
import { getBackupSnapshot } from '@/services/autoBackupStorage';

// Reads the persisted values straight from where they are stored — localStorage, or IndexedDB for
// the notes (readPersistedValue) — not from the stores, so it still works when the app can't
// render: the ErrorBoundary fallback uses it, and so does the automatic backup service
// (services/autoBackup.ts). A value that isn't valid JSON is exported as the raw string rather
// than aborting the whole backup.
export async function buildBackupSnapshot(): Promise<Record<string, unknown>> {
  const backup: Record<string, unknown> = { exportedAt: new Date().toISOString(), version: 2 };
  for (const key of PERSISTED_STORAGE_KEYS) {
    const val = await readPersistedValue(key);
    if (val === null) continue;
    try { backup[key] = JSON.parse(val); } catch { backup[key] = val; }
  }
  return backup;
}

function downloadBackupFile(backup: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadBackup() {
  const backup = await buildBackupSnapshot();
  downloadBackupFile(backup, `organisaitor-backup-${new Date().toISOString().split('T')[0]}.json`);
}

// Downloads one automatic snapshot (services/autoBackupStorage.ts) as the same JSON file a
// manual Export produces, so it can be restored through the ordinary file Restore. Named by the
// snapshot's own time (hyphenated for filesystems), not today's date.
export async function downloadAutoBackupSnapshot(id: number, createdAt: string) {
  const raw = await getBackupSnapshot(id);
  if (!raw) throw new Error('This snapshot could not be read.');
  const stamp = createdAt.slice(0, 19).replace('T', '_').replace(/:/g, '-');
  downloadBackupFile(JSON.parse(raw), `organisaitor-autobackup-${stamp}.json`);
}

// Writes every recognised key from a backup object (a manual Export/Restore file, or an
// automatic snapshot — same shape either way) back to persisted storage, rehydrates the three
// Supabase-synced stores whose live in-memory state a following forceUpload would otherwise
// read stale, and (if signed in) force-uploads the restored data — the exact sequence
// AccountPane's manual file-restore already used, extracted here so the automatic-backup
// restore UI (services/autoBackup.ts's consumer) doesn't reimplement it. Does NOT reload the
// page — callers own that, since a caller mid-confirmation-flow may want to show a message first.
export async function restoreBackupData(backup: Record<string, unknown>, userId: string | null): Promise<number> {
  let restored = 0;
  for (const key of PERSISTED_STORAGE_KEYS) {
    if (key in backup) {
      await writePersistedValue(key, JSON.stringify(backup[key]));
      restored++;
    }
  }
  if (restored === 0) throw new Error('No recognisable data found in this backup.');

  await Promise.all([
    useTaskStore.persist.rehydrate(),
    useCalendarStore.persist.rehydrate(),
    useTrackerStore.persist.rehydrate(),
  ]);

  if (userId) await forceUpload(userId);

  return restored;
}
