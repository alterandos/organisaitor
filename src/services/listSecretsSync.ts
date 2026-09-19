import { useListStore } from '@/store/listStore';
import { onVaultStatus, isVaultUnlocked } from '@/services/vault';
import { decryptSecrets } from '@/services/noteSecrets';
import {
  getListSecrets, getItemSecrets, putListSecrets, putItemSecrets,
  dropListSecrets, dropItemSecrets, clearListSecretsCache,
  type ListSecrets, type ItemSecrets,
} from '@/services/listSecrets';

// Keeps the list/list-item plaintext caches (listSecrets.ts) in step with reality — the Lists
// twin of noteSecretsSync.ts: decrypt whatever encrypted list/item has a missing or stale cache
// entry while the vault is unlocked (unlock, trusted-device auto-unlock, sync pulls), and wipe
// the caches whenever it isn't. The before-lock settle hook (flushEncryptions) is already
// registered by noteSecretsSync — the queue is shared, so it covers list edits too.

let started = false;
let refreshing = false;
let again = false;

async function refresh(): Promise<void> {
  if (refreshing) { again = true; return; }
  refreshing = true;
  try {
    do {
      again = false;
      if (!isVaultUnlocked()) { clearListSecretsCache(); continue; }
      const { lists, listItems } = useListStore.getState();

      for (const l of Object.values(lists)) {
        if (!l.isEncrypted) { dropListSecrets(l.id); continue; }
        if (!l.encryptedPayload) continue;
        const cached = getListSecrets(l.id);
        if (cached && (cached.dirty || cached.payload === l.encryptedPayload)) continue;
        try {
          const secrets = await decryptSecrets<ListSecrets>(l.encryptedPayload);
          // Re-check after the await: an edit may have landed or a newer payload arrived via sync.
          const now = useListStore.getState().lists[l.id];
          if (now?.encryptedPayload !== l.encryptedPayload || getListSecrets(l.id)?.dirty) continue;
          putListSecrets(l.id, secrets, l.encryptedPayload, false);
        } catch (err) {
          console.error('[listSecrets] could not decrypt list', l.id, err);
        }
      }

      for (const i of Object.values(listItems)) {
        if (!i.isEncrypted) { dropItemSecrets(i.id); continue; }
        if (!i.encryptedPayload) continue; // born encrypted, first payload still in flight
        const cached = getItemSecrets(i.id);
        if (cached && (cached.dirty || cached.payload === i.encryptedPayload)) continue;
        try {
          const secrets = await decryptSecrets<ItemSecrets>(i.encryptedPayload);
          const now = useListStore.getState().listItems[i.id];
          if (now?.encryptedPayload !== i.encryptedPayload || getItemSecrets(i.id)?.dirty) continue;
          putItemSecrets(i.id, secrets, i.encryptedPayload, false);
        } catch (err) {
          console.error('[listSecrets] could not decrypt list item', i.id, err);
        }
      }
    } while (again);
  } finally {
    refreshing = false;
  }
}

export function initListSecretsSync(): void {
  if (started) return;
  started = true;
  onVaultStatus(() => { void refresh(); });
  useListStore.subscribe((state, prev) => {
    if (state.lists !== prev.lists || state.listItems !== prev.listItems) void refresh();
  });
}
