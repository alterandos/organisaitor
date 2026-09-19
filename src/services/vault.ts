import { supabase } from '@/services/supabase';

// Client-side encryption vault — generates a symmetric AES-GCM key that only ever exists
// unwrapped in memory on a device that's unlocked it. Supabase only ever stores two
// PBKDF2-wrapped copies of that key (passphrase path + recovery-code path); the raw key
// and the secrets used to unwrap it never cross the network. See BACKLOG.md "Client-side
// encryption for sensitive content" for the full design discussion — in particular, why
// the wrapping secret can't be derived from the Supabase login password (Supabase's own
// server verifies that password, so anything derived from it would be reconstructable by
// Supabase too, defeating the point of protecting data from the project admin/operator).

const KDF_ITERATIONS = 250_000;
const AES_KEY_LENGTH = 256;
const IDB_NAME = 'organisaitor-vault';
const IDB_STORE = 'keys';

interface VaultRow {
  wrapped_key: string;
  wrapped_key_iv: string;
  salt: string;
  recovery_wrapped_key: string;
  recovery_wrapped_key_iv: string;
  recovery_salt: string;
  kdf_iterations: number;
}

// 'unavailable' = the user_vault table couldn't be read at all (missing migration/grant,
// network error) — distinct from 'locked' (a vault exists but isn't unlocked) so the UI can
// say so instead of showing an unlock form for a vault that doesn't exist or can't be read.
export type VaultStatus = 'unknown' | 'not-set-up' | 'locked' | 'unlocked' | 'unavailable';

let status: VaultStatus = 'unknown';
let rawVaultKey: CryptoKey | null = null;
let cachedRow: VaultRow | null = null;
let currentUserId: string | null = null;
// Set by an explicit "Lock now", cleared by the next successful unlock. Belt-and-braces with
// untrustThisDevice(): even if the trusted-device cache somehow survived, a re-check (Supabase
// re-fires SIGNED_IN on every tab refocus) must not silently undo a lock the user asked for.
let manuallyLocked = false;

// Code holding plaintext or unsaved edits registers here so lockVault() can flush it BEFORE the
// key is dropped — once the key is gone nothing can be encrypted, so a pending edit would be
// lost. (noteSecretsSync flushes in-flight re-encryptions; NoteEditor flushes its autosave.)
// Two phases, because they depend on each other: every 'flush' hook runs first (UI code pushing
// its unsaved edits into the store, which queues their encryption), THEN every 'settle' hook
// (waiting for those queued encryptions to land). Registration order can't guarantee this —
// the settle hook is registered at app start, long before an editor mounts.
type BeforeLockHook = () => void | Promise<void>;
const beforeLockHooks: Record<'flush' | 'settle', BeforeLockHook[]> = { flush: [], settle: [] };
export function registerBeforeLock(fn: BeforeLockHook, phase: 'flush' | 'settle' = 'flush'): () => void {
  const list = beforeLockHooks[phase];
  list.push(fn);
  return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
}

const listeners: Array<(s: VaultStatus) => void> = [];
function setStatus(s: VaultStatus) {
  status = s;
  listeners.forEach((fn) => fn(s));
}
export function onVaultStatus(fn: (s: VaultStatus) => void): () => void {
  listeners.push(fn);
  fn(status);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}
let lastError: string | null = null;
// Why the vault is 'unavailable' — surfaced in the Account pane so the cause is visible
// without opening the console.
export function getVaultError(): string | null { return lastError; }
export function isVaultUnlocked(): boolean { return status === 'unlocked'; }

// ── base64 helpers (loop-based, not spread — encryptField/decryptField handle arbitrarily
// large note content, and String.fromCharCode(...bytes) can blow the engine's per-call
// argument limit on a large-enough array) ──
function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function randomBytes(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len));
}

// 128 bits of entropy, formatted in dash-separated groups of 4 for readability/transcription.
function generateRecoveryCode(): string {
  const bytes = randomBytes(16);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return hex.match(/.{1,4}/g)!.join('-');
}

async function deriveWrappingKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

// ── IndexedDB — "trust this device" local key cache. Convenience only, not a security
// boundary of its own: Supabase never sees this cached key either way. Tauri/Android could
// later upgrade this to an OS-backed secure store (Stronghold/Keychain/Keystore) for a real
// access boundary — not built yet, see BACKLOG.md. ──
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function trustThisDevice(userId: string): Promise<void> {
  if (!rawVaultKey) throw new Error('Vault is locked');
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(rawVaultKey, userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function untrustThisDevice(userId: string): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadTrustedDeviceKey(userId: string): Promise<CryptoKey | null> {
  try {
    const db = await openIdb();
    const key = await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(userId);
      req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return key;
  } catch {
    return null; // IndexedDB unavailable (private window, etc.) — fail soft, just prompt for passphrase
  }
}

// ── Status / lifecycle ──

async function fetchVaultRow(userId: string): Promise<VaultRow | null> {
  const { data, error } = await supabase.from('user_vault').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as VaultRow | null;
}

const VAULT_FETCH_TIMEOUT_MS = 15_000;
const IDB_TIMEOUT_MS = 3_000;
let checkSeq = 0;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s while ${label}`)), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

// Called on sign-in (App.tsx, mirroring initSync). Checks whether this account has a
// vault at all, then tries a trusted-device auto-unlock before falling back to 'locked'.
//
// Every wait here is bounded: an earlier version had none, so a request that never settled
// left the status stuck on 'unknown' forever ("Checking encryption status…") with nothing in
// the console to say why. A hang now surfaces as 'unavailable' with the step it hung on.
// `checkSeq` makes only the most recent call apply its result — sign-in fires this several
// times (initial session + SIGNED_IN + StrictMode double-invoke) and a slow stale call must
// not overwrite a newer one's answer.
export async function checkVaultStatus(userId: string): Promise<void> {
  // Supabase re-fires SIGNED_IN on tab refocus/token refresh, not just real sign-ins — an
  // already-unlocked vault must stay unlocked (an untrusted device holds the key in memory
  // only, so falling through would re-lock it and demand the passphrase again).
  if (rawVaultKey && status === 'unlocked') return;
  currentUserId = userId;
  if (manuallyLocked && cachedRow && status === 'locked') return;
  const seq = ++checkSeq;
  const stale = () => seq !== checkSeq;
  try {
    console.info('[vault] checking: fetching vault row');
    const row = await withTimeout(fetchVaultRow(userId), VAULT_FETCH_TIMEOUT_MS, 'fetching the vault row from Supabase');
    if (stale()) return;
    if (!row) { cachedRow = null; lastError = null; setStatus('not-set-up'); return; }
    cachedRow = row;
    console.info('[vault] checking: reading trusted-device cache');
    // A hung/blocked IndexedDB just means "no cached key" — never worth blocking on.
    const cachedKey = await withTimeout(loadTrustedDeviceKey(userId), IDB_TIMEOUT_MS, 'reading the trusted-device cache')
      .catch(() => null);
    if (stale()) return;
    lastError = null;
    if (cachedKey && !manuallyLocked) {
      rawVaultKey = cachedKey;
      setStatus('unlocked');
    } else {
      setStatus('locked');
    }
  } catch (err) {
    if (stale()) return;
    // Never treat an unreadable vault as "not set up" (would invite creating a second one
    // that overwrites the first) or as "locked" (would show an unlock form with nothing to unlock).
    console.error('[vault] could not read user_vault:', err instanceof Error ? err.message : err);
    cachedRow = null;
    lastError = err instanceof Error ? err.message : String(err);
    setStatus('unavailable');
  }
}

// Manual re-check from the Account pane's Retry button — flips back to 'unknown' first so the
// user sees it actually re-running instead of the old error sitting there.
export function retryVaultCheck(userId: string): Promise<void> {
  setStatus('unknown');
  return checkVaultStatus(userId);
}

// Called on sign-out — full reset, unlike lockVault() which keeps cachedRow so a later
// unlockWithPassphrase() in the same session doesn't need a re-fetch.
export function resetVaultModuleState(): void {
  rawVaultKey = null;
  cachedRow = null;
  currentUserId = null;
  manuallyLocked = false;
  setStatus('unknown');
}

// "Lock now". Sticky by design: besides dropping the in-memory key it also forgets the
// trusted-device copy — before, that copy survived, so the next SIGNED_IN (fired on every tab
// refocus) found it and quietly unlocked again, which is why locking looked unreliable. The
// cost is a passphrase entry to unlock afterwards; ticking "Trust this device" then re-caches it.
export async function lockVault(): Promise<void> {
  if (status !== 'unlocked') return;
  for (const phase of ['flush', 'settle'] as const) {
    for (const hook of [...beforeLockHooks[phase]]) {
      try { await hook(); } catch (err) { console.error(`[vault] before-lock (${phase}) hook failed:`, err); }
    }
  }
  rawVaultKey = null;
  manuallyLocked = true;
  setStatus('locked');
  if (currentUserId) await untrustThisDevice(currentUserId).catch((err) => console.error('[vault] could not clear trusted-device key:', err));
}

// First-time setup. Returns the recovery code exactly once — the caller (Settings UI) is
// responsible for showing it and gating continuation on an explicit "I've saved this"
// confirmation, since there is no way to retrieve it again afterward.
export async function setupVault(userId: string, passphrase: string): Promise<{ recoveryCode: string }> {
  const vaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt']);

  const salt = randomBytes(16);
  const wrapIv = randomBytes(12);
  const passWrapKey = await deriveWrappingKey(passphrase, salt, KDF_ITERATIONS);
  const wrappedKeyBuf = await crypto.subtle.wrapKey('raw', vaultKey, passWrapKey, { name: 'AES-GCM', iv: wrapIv as BufferSource });

  const recoveryCode = generateRecoveryCode();
  const recoverySalt = randomBytes(16);
  const recoveryIv = randomBytes(12);
  const recoveryWrapKey = await deriveWrappingKey(recoveryCode, recoverySalt, KDF_ITERATIONS);
  const recoveryWrappedBuf = await crypto.subtle.wrapKey('raw', vaultKey, recoveryWrapKey, { name: 'AES-GCM', iv: recoveryIv as BufferSource });

  const row: VaultRow = {
    wrapped_key: toB64(wrappedKeyBuf),
    wrapped_key_iv: toB64(wrapIv),
    salt: toB64(salt),
    recovery_wrapped_key: toB64(recoveryWrappedBuf),
    recovery_wrapped_key_iv: toB64(recoveryIv),
    recovery_salt: toB64(recoverySalt),
    kdf_iterations: KDF_ITERATIONS,
  };
  const { error } = await supabase.from('user_vault').upsert({ user_id: userId, ...row });
  if (error) throw new Error(error.message);

  cachedRow = row;
  rawVaultKey = vaultKey;
  currentUserId = userId;
  manuallyLocked = false;
  setStatus('unlocked');
  return { recoveryCode };
}

export async function unlockWithPassphrase(passphrase: string): Promise<boolean> {
  if (!cachedRow) return false;
  try {
    const wrapKey = await deriveWrappingKey(passphrase, fromB64(cachedRow.salt), cachedRow.kdf_iterations);
    const key = await crypto.subtle.unwrapKey(
      'raw', fromB64(cachedRow.wrapped_key) as BufferSource, wrapKey,
      { name: 'AES-GCM', iv: fromB64(cachedRow.wrapped_key_iv) as BufferSource },
      { name: 'AES-GCM', length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt'],
    );
    rawVaultKey = key;
    manuallyLocked = false;
    setStatus('unlocked');
    return true;
  } catch {
    return false; // wrong passphrase — AES-GCM's auth tag check fails, unwrapKey rejects
  }
}

// Checks a passphrase / recovery code against the stored vault WITHOUT changing lock state —
// for "re-enter your password to confirm" prompts (e.g. permanently decrypting a note) while the
// vault is already unlocked. When the vault is locked, callers use the unlockWith* functions
// instead (which verify and unlock in one step).
export async function verifyVaultSecret(secret: string, mode: 'passphrase' | 'recovery'): Promise<boolean> {
  if (!cachedRow) return false;
  try {
    const recovery = mode === 'recovery';
    const wrapKey = await deriveWrappingKey(
      recovery ? secret.trim().toUpperCase() : secret,
      fromB64(recovery ? cachedRow.recovery_salt : cachedRow.salt),
      cachedRow.kdf_iterations,
    );
    await crypto.subtle.unwrapKey(
      'raw', fromB64(recovery ? cachedRow.recovery_wrapped_key : cachedRow.wrapped_key) as BufferSource, wrapKey,
      { name: 'AES-GCM', iv: fromB64(recovery ? cachedRow.recovery_wrapped_key_iv : cachedRow.wrapped_key_iv) as BufferSource },
      { name: 'AES-GCM', length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt'],
    );
    return true;
  } catch {
    return false;
  }
}

export async function unlockWithRecoveryCode(code: string): Promise<boolean> {
  if (!cachedRow) return false;
  try {
    const wrapKey = await deriveWrappingKey(code.trim().toUpperCase(), fromB64(cachedRow.recovery_salt), cachedRow.kdf_iterations);
    const key = await crypto.subtle.unwrapKey(
      'raw', fromB64(cachedRow.recovery_wrapped_key) as BufferSource, wrapKey,
      { name: 'AES-GCM', iv: fromB64(cachedRow.recovery_wrapped_key_iv) as BufferSource },
      { name: 'AES-GCM', length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt'],
    );
    rawVaultKey = key;
    manuallyLocked = false;
    setStatus('unlocked');
    return true;
  } catch {
    return false;
  }
}

// ── Field encryption — the only surface most callers (e.g. NoteEditor) need ──

interface EncryptedEnvelope { iv: string; ciphertext: string; }

export async function encryptField(plaintext: string): Promise<string> {
  if (!rawVaultKey) throw new Error('Vault is locked');
  const iv = randomBytes(12);
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, rawVaultKey, new TextEncoder().encode(plaintext));
  const envelope: EncryptedEnvelope = { iv: toB64(iv), ciphertext: toB64(ciphertextBuf) };
  return JSON.stringify(envelope);
}

export async function decryptField(envelopeJson: string): Promise<string> {
  if (!rawVaultKey) throw new Error('Vault is locked');
  const envelope = JSON.parse(envelopeJson) as EncryptedEnvelope;
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(envelope.iv) as BufferSource },
    rawVaultKey,
    fromB64(envelope.ciphertext) as BufferSource,
  );
  return new TextDecoder().decode(plainBuf);
}
