import { useNoteStore } from '@/store/noteStore';
import { onVaultStatus, isVaultUnlocked, registerBeforeLock } from '@/services/vault';
import {
  getNoteSecrets, getEntrySecrets, putNoteSecrets, putEntrySecrets,
  dropNoteSecrets, dropEntrySecrets, clearSecretsCache, decryptSecrets, flushEncryptions,
  type NoteSecrets, type EntrySecrets,
} from '@/services/noteSecrets';

// Keeps the plaintext memory cache (noteSecrets.ts) in step with reality:
//   • vault unlocked  → decrypt every encrypted note/entry whose cached copy is missing or stale
//                       (covers unlock, trusted-device auto-unlock, and notes pulled in by sync)
//   • vault not unlocked → wipe the cache, so locking really does make everything unreadable
// Runs on every vault-status change and every notes/entries change; each pass is a cheap scan
// that only decrypts what actually needs it.

let started = false;
let refreshing = false;
let again = false;

async function refresh(): Promise<void> {
  if (refreshing) { again = true; return; }
  refreshing = true;
  try {
    do {
      again = false;
      if (!isVaultUnlocked()) { clearSecretsCache(); continue; }
      const { notes, structuredTagEntries } = useNoteStore.getState();

      for (const n of Object.values(notes)) {
        if (!n.isEncrypted) { dropNoteSecrets(n.id); continue; }
        if (!n.encryptedPayload) { void useNoteStore.getState().upgradeLegacyEncryptedNote(n.id); continue; }
        const cached = getNoteSecrets(n.id);
        if (cached && (cached.dirty || cached.payload === n.encryptedPayload)) continue;
        try {
          const secrets = await decryptSecrets<NoteSecrets>(n.encryptedPayload);
          // Re-check after the await: an edit may have landed (dirty cache) or a newer
          // payload arrived from sync while this one was decrypting.
          const now = useNoteStore.getState().notes[n.id];
          if (now?.encryptedPayload !== n.encryptedPayload || getNoteSecrets(n.id)?.dirty) continue;
          putNoteSecrets(n.id, secrets, n.encryptedPayload, false);
        } catch (err) {
          console.error('[noteSecrets] could not decrypt note', n.id, err);
        }
      }

      for (const e of Object.values(structuredTagEntries)) {
        if (!e.isEncrypted) { dropEntrySecrets(e.id); continue; }
        if (!e.encryptedPayload) continue; // born encrypted, first payload still in flight
        const cached = getEntrySecrets(e.id);
        if (cached && (cached.dirty || cached.payload === e.encryptedPayload)) continue;
        try {
          const secrets = await decryptSecrets<EntrySecrets>(e.encryptedPayload);
          const now = useNoteStore.getState().structuredTagEntries[e.id];
          if (now?.encryptedPayload !== e.encryptedPayload || getEntrySecrets(e.id)?.dirty) continue;
          putEntrySecrets(e.id, secrets, e.encryptedPayload, false);
        } catch (err) {
          console.error('[noteSecrets] could not decrypt entry', e.id, err);
        }
      }
    } while (again);
  } finally {
    refreshing = false;
  }
}

export function initNoteSecretsSync(): void {
  if (started) return;
  started = true;
  registerBeforeLock(flushEncryptions, 'settle');
  onVaultStatus(() => { void refresh(); });
  useNoteStore.subscribe((state, prev) => {
    if (state.notes !== prev.notes || state.structuredTagEntries !== prev.structuredTagEntries) void refresh();
  });
}
