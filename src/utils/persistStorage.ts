import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { LABELS } from '@/config/labels';

// THE storage every persisted store uses (`storage: persistStorage()` in its persist options).
//
// Browsers give a site roughly 5 MB of localStorage, shared by every store. Zustand's persist calls
// setItem inside the store's own `set`, so when the quota is hit the QuotaExceededError is thrown
// out of whatever action was running — touching a note, for instance — and takes the whole section
// down through the error boundary. Here a full disk is reported instead: the change stays in memory
// (and still syncs, if signed in), the user is told what is happening and how to
// free space, and the app keeps working. Any other storage error is rethrown untouched.

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (
    e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014
  );
}

export interface StorageUsageEntry { key: string; label: string; chars: number }

// Size of each persisted store's entry, biggest first. Counted in characters (UTF-16 units), which
// is what the browser's quota is measured in, so it is approximate but proportionate.
export function getStorageUsage(): StorageUsageEntry[] {
  const out: StorageUsageEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const label = LABELS.storage.keyNames[key];
      if (!label) continue;
      out.push({ key, label, chars: key.length + (localStorage.getItem(key)?.length ?? 0) });
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.chars - a.chars);
}

export const formatStorageSize = (chars: number) =>
  chars >= 1024 * 1024 ? `${(chars / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(chars / 1024))} KB`;

// Re-warned every so often, not once: someone who dismisses the dialog and carries on is still not
// saving, and should be reminded while that stays true.
const REWARN_AFTER_MS = 10 * 60 * 1000;
let lastWarnedAt = 0;

function warnStorageFull(failedKey: string) {
  console.error(`[persist] storage is full — "${failedKey}" was not saved`);
  if (Date.now() - lastWarnedAt < REWARN_AFTER_MS) return;
  lastWarnedAt = Date.now();
  const biggest = getStorageUsage()[0];
  void alertDialog(
    LABELS.storage.fullMessage(biggest ? `${biggest.label} use ${formatStorageSize(biggest.chars)} of it.` : ''),
    LABELS.storage.fullTitle,
  );
}

export const guardedLocalStorage: StateStorage = {
  getItem:    (name) => localStorage.getItem(name),
  setItem:    (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (e) {
      if (!isQuotaError(e)) throw e;
      warnStorageFull(name);
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
};

export const persistStorage = <S,>() => createJSONStorage<S>(() => guardedLocalStorage);

// For the IndexedDB path (idbStorage.ts), where a failed background write can't throw into the caller:
// a full quota gets the same alert; any other error gets a plain "couldn't save" one.
export function reportPersistFailure(key: string, error: unknown) {
  if (isQuotaError(error)) { warnStorageFull(key); return; }
  console.error(`[persist] could not save "${key}"`, error);
  if (Date.now() - lastWarnedAt < REWARN_AFTER_MS) return;
  lastWarnedAt = Date.now();
  void alertDialog(LABELS.storage.saveFailedMessage, LABELS.storage.saveFailedTitle);
}
