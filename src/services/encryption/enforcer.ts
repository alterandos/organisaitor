import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useTaskStore } from '@/store/taskStore';
import { isVaultUnlocked, onVaultStatus } from '@/services/vault';
import { log } from '@/utils/log';
import { ENCRYPTABLE_KINDS, scopeContext, waitingForEncryption } from './kinds';

// Encryption by scope — the enforcer: while the vault is unlocked, every item a scope covers that
// isn't encrypted yet is encrypted, one at a time, through its store's own encrypt action. It runs
// when the vault unlocks and whenever notes, notebooks, lists or Endeavours change, so a note made in
// (or moved into) an encrypted notebook is encrypted straight away, and one made while locked as
// soon as the vault is unlocked. Until then sync holds it on the device (kinds.ts heldFromSync).
// Idempotent and single-flight: a pass finds nothing to do once everything covered is encrypted.

const RETRY_AFTER_MS = 30_000;
const failedAt = new Map<string, number>();
let running: Promise<void> | null = null;
let again = false;

async function pass(force: boolean): Promise<void> {
  if (!isVaultUnlocked()) return;
  for (const w of waitingForEncryption(scopeContext())) {
    const key = `${w.kind}:${w.id}`;
    const failed = failedAt.get(key);
    if (!force && failed && Date.now() - failed < RETRY_AFTER_MS) continue;
    if (!isVaultUnlocked()) return;
    try {
      await ENCRYPTABLE_KINDS.find((k) => k.id === w.kind)!.encrypt(w.id);
      failedAt.delete(key);
    } catch (err) {
      failedAt.set(key, Date.now());
      log.warn('encryption', `could not encrypt ${key} yet`, err);
    }
  }
}

// A change while a pass runs asks for another pass (`again`), checked once the pass has settled, so
// nothing that arrives mid-pass, or as it finishes, is missed.
function run(force = false): Promise<void> {
  if (running) { again = true; return running; }
  again = false;
  running = pass(force).finally(() => {
    running = null;
    if (again) void run();
  });
  return running;
}

// Encrypts everything waiting now (sign-out does this before locking). Returns how many are still
// waiting afterwards: 0 unless the vault is locked or something couldn't be encrypted.
export async function encryptAllWaiting(): Promise<number> {
  while (running) await running;
  await run(true);
  return waitingForEncryption().length;
}

let stop: (() => void) | null = null;

export function initEncryptionScopes(): () => void {
  if (stop) return stop;
  const kick = () => { void run(); };
  const unsubs = [
    onVaultStatus(kick),
    useNoteStore.subscribe((s, p) => { if (s.notes !== p.notes || s.noteTags !== p.noteTags) kick(); }),
    useListStore.subscribe((s, p) => { if (s.lists !== p.lists) kick(); }),
    useTaskStore.subscribe((s, p) => { if (s.collections !== p.collections) kick(); }),
  ];
  kick();
  stop = () => { unsubs.forEach((u) => u()); stop = null; };
  return stop;
}

export function resetEncryptionEnforcerForTests(): void {
  stop?.();
  failedAt.clear();
  running = null;
  again = false;
}
