import { PERSISTED_STORAGE_KEYS } from '@/config/backup';
import { readPersistedValue } from '@/utils/idbStorage';

// Reads the persisted values straight from where they are stored — localStorage, or IndexedDB for
// the notes (readPersistedValue) — not from the stores, so it still works when the app can't
// render: the ErrorBoundary fallback uses it. A value that isn't valid JSON is exported as
// the raw string rather than aborting the whole backup.
export async function downloadBackup() {
  const backup: Record<string, unknown> = { exportedAt: new Date().toISOString(), version: 2 };
  for (const key of PERSISTED_STORAGE_KEYS) {
    const val = await readPersistedValue(key);
    if (val === null) continue;
    try { backup[key] = JSON.parse(val); } catch { backup[key] = val; }
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `organisaitor-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
