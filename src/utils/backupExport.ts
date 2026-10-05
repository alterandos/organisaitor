import { PERSISTED_STORAGE_KEYS } from '@/config/backup';
import { readPersistedValue, writePersistedValue } from '@/utils/idbStorage';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useTrashStore } from '@/store/trashStore';
import { useOverviewStore } from '@/store/overviewStore';
import { forceUpload } from '@/services/sync/syncService';
import { getBackupSnapshot } from '@/services/autoBackupStorage';
import { saveFile } from '@/utils/saveFile';

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

function downloadBackupFile(backup: unknown, filename: string): Promise<void> {
  return saveFile(filename, new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
}

export async function downloadBackup() {
  const backup = await buildBackupSnapshot();
  await downloadBackupFile(backup, `organisaitor-backup-${new Date().toISOString().split('T')[0]}.json`);
}

// Downloads one automatic snapshot (services/autoBackupStorage.ts) as the same JSON file a
// manual Export produces, so it can be restored through the ordinary file Restore. Named by the
// snapshot's own time (hyphenated for filesystems), not today's date.
export async function downloadAutoBackupSnapshot(id: number, createdAt: string) {
  const raw = await getBackupSnapshot(id);
  if (!raw) throw new Error('This snapshot could not be read.');
  const stamp = createdAt.slice(0, 19).replace('T', '_').replace(/:/g, '-');
  await downloadBackupFile(JSON.parse(raw), `organisaitor-autobackup-${stamp}.json`);
}

// Writes every recognised key from a backup object (a manual Export/Restore file, or an
// automatic snapshot — same shape either way) back to persisted storage, rehydrates EVERY
// Supabase-synced store (forceUpload reads their live in-memory state, so a store left out
// uploads what was there before the restore — over the restored data), and (if signed in)
// force-uploads the restored data — the exact sequence
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

  // Every store syncService uploads. Until 2026-10-05 this listed only the first three, so a
  // signed-in restore re-uploaded the CURRENT notes/lists/schedules/portfolio/overviews/trash and
  // the reload pulled them back: restoring an older backup left those unchanged.
  // backupExport.test.ts checks this list against syncService.ts's store imports.
  await Promise.all([
    useTaskStore.persist.rehydrate(),
    useCalendarStore.persist.rehydrate(),
    useTrackerStore.persist.rehydrate(),
    useScheduleStore.persist.rehydrate(),
    useListStore.persist.rehydrate(),
    useNoteStore.persist.rehydrate(),
    usePortfolioStore.persist.rehydrate(),
    useTrashStore.persist.rehydrate(),
    useOverviewStore.persist.rehydrate(),
  ]);

  if (userId) await forceUpload(userId);

  return restored;
}
