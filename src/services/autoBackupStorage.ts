// Dedicated IndexedDB database for automatic local backup snapshots — deliberately its OWN
// database (`organisaitor-backups`), not a new object store added to `utils/idbStorage.ts`'s
// `organisaitor` database. That database already holds notes/trash for real, and this safety-
// net feature must never risk a version-upgrade conflict (or any other interaction) with the
// storage the app's actual data depends on — especially right after the 2026-09-25 note-content
// data-loss incident this feature exists to make recoverable. Same reasoning, taken further:
// every failure here is swallowed rather than surfaced (this is a best-effort safety net, not
// critical-path data) — a broken backup mechanism must never itself break the app.
//
// Works identically in the browser, Tauri's WebView2/WKWebView, and Android's WebView — all
// three support IndexedDB as a standard web platform API, so this needs no platform-specific
// filesystem plugin.

const DB_NAME = 'organisaitor-backups';
const STORE   = 'snapshots';

interface SnapshotRow { id: number; createdAt: string; data: string }

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
  }
  return dbPromise;
}

export interface BackupSnapshotMeta {
  id:        number;
  createdAt: string; // ISO 8601
}

// Stores a full backup snapshot (the same `{ exportedAt, version, ...oneKeyPerStore }` JSON
// shape a manual Export produces — see utils/backupExport.ts's buildBackupSnapshot). Returns
// the new snapshot's id, or null if it couldn't be saved (IndexedDB unavailable, quota, …).
export async function saveBackupSnapshot(data: string): Promise<number | null> {
  try {
    const db = await openDb();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).add({ createdAt: new Date().toISOString(), data } satisfies Omit<SnapshotRow, 'id'>);
      tx.oncomplete = () => resolve(req.result as number);
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[autoBackup] failed to save snapshot', e);
    return null;
  }
}

// Newest first — matches how a restore-picker would want to list them.
export async function listBackupSnapshots(): Promise<BackupSnapshotMeta[]> {
  try {
    const db = await openDb();
    const rows = await new Promise<SnapshotRow[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as SnapshotRow[]);
      req.onerror   = () => reject(req.error);
    });
    return rows
      .map(({ id, createdAt }) => ({ id, createdAt }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (e) {
    console.error('[autoBackup] failed to list snapshots', e);
    return [];
  }
}

export async function getBackupSnapshot(id: number): Promise<string | null> {
  try {
    const db = await openDb();
    const row = await new Promise<SnapshotRow | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as SnapshotRow | undefined);
      req.onerror   = () => reject(req.error);
    });
    return row?.data ?? null;
  } catch (e) {
    console.error('[autoBackup] failed to read snapshot', e);
    return null;
  }
}

export async function deleteBackupSnapshot(id: number): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[autoBackup] failed to delete snapshot', e);
  }
}
