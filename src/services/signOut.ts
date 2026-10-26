import { resetWelcome } from '@/services/welcome';
import { useAuthStore } from '@/store/authStore';
import { forceUpload } from '@/services/sync/syncService';
import { lockVault, untrustThisDevice } from '@/services/vault';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { LABELS } from '@/config/labels';
import { encryptAllWaiting } from '@/services/encryption/enforcer';

import { log } from '@/utils/log';
// The one way a user signs out. Returns false if they cancelled (still signed in, nothing lost).
//   1. confirm, and say what stays on this device (the local-only stores);
//   2. encrypt whatever an encrypted notebook or Endeavour covers that isn't yet (or warn);
//   3. lock the vault — flushes in-flight note/list encryptions, wipes the decrypted caches and
//      forgets the trusted-device key — BEFORE any store is cleared;
//   4. push everything to the cloud and only wipe if that succeeded; if it didn't (offline, a
//      table failing), say so and let the user cancel rather than silently discard data;
//   5. authStore.signOut(): stopSync() first, then the wipe (see clearLocalData.ts).
export async function requestSignOut(): Promise<boolean> {
  const user = useAuthStore.getState().user;

  const ok = await confirmDialog({
    title:        LABELS.signOut.title,
    message:      `${LABELS.signOut.message}\n\n${LABELS.signOut.keptOnDevice}`,
    confirmLabel: LABELS.signOut.confirm,
  });
  if (!ok) return false;

  if (user) {
    // Encryption by scope: anything covered but not yet encrypted was never uploaded, so the wipe
    // would lose it. Encrypt it now if the vault is open; otherwise say so (Cancel by default).
    const waiting = await encryptAllWaiting();
    if (waiting > 0) {
      const discard = await confirmDialog({
        title:        LABELS.signOut.waitingTitle,
        message:      LABELS.signOut.waitingMessage(waiting),
        confirmLabel: LABELS.signOut.waitingConfirm,
        destructive:  true,
      });
      if (!discard) return false;
    }
    await lockVault();
    await untrustThisDevice(user.id).catch((err) => log.error('signOut', 'could not clear trusted-device key', err));

    try {
      await forceUpload(user.id);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      const discard = await confirmDialog({
        title:        LABELS.signOut.unsavedTitle,
        message:      LABELS.signOut.unsavedMessage(reason),
        confirmLabel: LABELS.signOut.unsavedConfirm,
        destructive:  true,
      });
      if (!discard) return false;
    }
  }

  await useAuthStore.getState().signOut();
  // The next person on this device is greeted by the welcome page again.
  resetWelcome();
  return true;
}
