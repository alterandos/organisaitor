import { PERSISTED_STORAGE_KEYS } from '@/config/backup';
import { readPersistedValue } from '@/utils/idbStorage';
import { buildBackupSnapshot } from '@/utils/backupExport';
import { takeFirstReads } from '@/utils/persistFirstRead';
import { saveBackupSnapshot, listBackupSnapshots, deleteBackupSnapshot } from '@/services/autoBackupStorage';
import { log } from '@/utils/log';

// A safety snapshot before every store migration (2026-10-28, docs/features/endeavours.md
// "Reversibility"): when the app opens on a newer build, a store whose stored version was older is
// upgraded by its `migrate` as it loads. Once the stores have loaded, any store whose stored version
// changed is written into a "before upgrade" snapshot with the data it had before (the rest as they
// are now), so a migration that goes wrong can be undone from Settings → Backups. Works for every
// persisted store with no change to any of them: the storage layer remembers what it first handed
// out (utils/persistFirstRead.ts).

export const UPGRADE_SNAPSHOTS_KEPT = 3;

function versionOf(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

// Returns the keys that were upgraded (empty when nothing was).
export async function takeUpgradeSnapshot(): Promise<string[]> {
  const before = takeFirstReads();
  const upgraded: { key: string; raw: string }[] = [];
  for (const key of PERSISTED_STORAGE_KEYS) {
    const raw = before.get(key);
    const was = versionOf(raw);
    if (raw == null || was === null) continue;
    const now = versionOf(await readPersistedValue(key));
    if (now !== null && now !== was) upgraded.push({ key, raw });
  }
  if (upgraded.length === 0) return [];

  const backup = await buildBackupSnapshot();
  for (const { key, raw } of upgraded) {
    try { backup[key] = JSON.parse(raw); } catch { backup[key] = raw; }
  }
  backup.upgraded = upgraded.map((u) => u.key);
  const id = await saveBackupSnapshot(JSON.stringify(backup), 'upgrade');
  if (id === null) { log.error('upgradeSnapshot', 'could not keep the data from before the upgrade'); return []; }
  log.info('upgradeSnapshot', 'kept the data from before an upgrade', backup.upgraded);

  const older = (await listBackupSnapshots()).filter((s) => s.kind === 'upgrade').slice(UPGRADE_SNAPSHOTS_KEPT);
  for (const s of older) await deleteBackupSnapshot(s.id);
  return upgraded.map((u) => u.key);
}
