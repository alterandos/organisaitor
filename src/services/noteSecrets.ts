import { create } from 'zustand';
import { encryptField, decryptField } from '@/services/vault';
import type { Note, NoteTab, StructuredTagEntry } from '@/types/notes';

// Encrypted notes / structured-tag entries — see BACKLOG.md "Client-side encryption for
// sensitive content" and CLAUDE.md "Client-side encryption for Notes".
//
// MODEL: when a note is encrypted, every sensitive field (SENSITIVE_NOTE_FIELDS below) is
// moved into ONE AES-GCM envelope (`encryptedPayload`) and BLANKED on the stored object — in
// zustand state, in localStorage, and in Supabase alike, so the sync pipeline/mappers stay
// dumb pass-throughs with zero crypto awareness. Plaintext exists only in the memory cache
// below, filled while the vault is unlocked (noteSecretsSync.ts) and wiped on lock.
//
// READING: never read `note.title` / `.content` / … directly for a note that might be
// encrypted — go through noteView() (or useNoteView/useNoteViews for React). WRITING: go
// through the noteStore actions, which detect an encrypted note, apply the edit to the cached
// plaintext synchronously (so the UI updates instantly) and re-encrypt in the background
// (queueEncrypt). Both sides are what make the "one place to look" guarantee hold.

export const LOCKED_NOTE_TITLE = 'Encrypted note';
export const LOCKED_ENTRY_TERM = 'Encrypted entry';

export interface NoteSecrets {
  v: 1;
  title: string;
  content: string;
  abstract: string | null;
  tabs: NoteTab[];
  mainTabName: string;
  tagData: Note['tagData'];
}

export interface EntrySecrets {
  v: 1;
  term: string;
  fields: Record<string, unknown>;
}

export const extractNoteSecrets = (n: Note): NoteSecrets => ({
  v: 1, title: n.title, content: n.content, abstract: n.abstract,
  tabs: n.tabs, mainTabName: n.mainTabName, tagData: n.tagData,
});

// The stored form of an encrypted note: sensitive fields emptied. `tabOrder` (tab ids only)
// is deliberately left alone — ids aren't sensitive and the order must survive the blanking.
export const blankNoteSecrets = (n: Note): Note => ({
  ...n, title: '', content: '', abstract: null, tabs: [], mainTabName: 'Main', tagData: {},
});

export const applyNoteSecrets = (n: Note, s: NoteSecrets): Note => ({
  ...n, title: s.title, content: s.content, abstract: s.abstract,
  tabs: s.tabs, mainTabName: s.mainTabName, tagData: s.tagData,
});

export const extractEntrySecrets = (e: StructuredTagEntry): EntrySecrets => ({ v: 1, term: e.term, fields: e.fields });
export const blankEntrySecrets = (e: StructuredTagEntry): StructuredTagEntry => ({ ...e, term: '', fields: {} });
export const applyEntrySecrets = (e: StructuredTagEntry, s: EntrySecrets): StructuredTagEntry => ({ ...e, term: s.term, fields: s.fields });

// ── Memory-only plaintext cache ──────────────────────────────────────────────
// `payload` is the ciphertext the plaintext was decrypted from (or encrypted into); an entry
// is only trusted while it still matches the note's current encryptedPayload — a sync pull
// that replaces the payload makes the entry stale until noteSecretsSync re-decrypts it.
// `dirty` = an edit was applied to `secrets` whose re-encryption hasn't landed yet, so
// `payload` is briefly out of date; the plaintext is still the truth.

interface CacheEntry<S> { payload: string | null; secrets: S; dirty: boolean }
const noteCache = new Map<string, CacheEntry<NoteSecrets>>();
const entryCache = new Map<string, CacheEntry<EntrySecrets>>();

// Bumped whenever the cache changes so React views re-derive (see store/noteViews.ts).
export const useSecretsVersion = create<{ version: number }>()(() => ({ version: 0 }));
export const bumpSecretsVersion = () => useSecretsVersion.setState((s) => ({ version: s.version + 1 }));

export const getNoteSecrets  = (id: string) => noteCache.get(id);
export const getEntrySecrets = (id: string) => entryCache.get(id);
export function putNoteSecrets(id: string, secrets: NoteSecrets, payload: string | null, dirty = false) {
  noteCache.set(id, { secrets, payload, dirty }); bumpSecretsVersion();
}
export function putEntrySecrets(id: string, secrets: EntrySecrets, payload: string | null, dirty = false) {
  entryCache.set(id, { secrets, payload, dirty }); bumpSecretsVersion();
}
export function dropNoteSecrets(id: string)  { if (noteCache.delete(id))  bumpSecretsVersion(); }
export function dropEntrySecrets(id: string) { if (entryCache.delete(id)) bumpSecretsVersion(); }
export function clearSecretsCache() {
  if (noteCache.size === 0 && entryCache.size === 0) return;
  noteCache.clear(); entryCache.clear(); bumpSecretsVersion();
}

const usable = <S,>(e: CacheEntry<S> | undefined, payload: string | null): e is CacheEntry<S> =>
  !!e && (e.dirty || (payload !== null && e.payload === payload));

// ── The overlay — the one way to read a possibly-encrypted note ──────────────

export function isNoteLocked(n: Note): boolean {
  return n.isEncrypted && !usable(noteCache.get(n.id), n.encryptedPayload);
}
export function noteView(n: Note): Note {
  if (!n.isEncrypted) return n;
  const e = noteCache.get(n.id);
  if (usable(e, n.encryptedPayload)) return applyNoteSecrets(n, e.secrets);
  return { ...n, title: LOCKED_NOTE_TITLE };
}
export function isEntryLocked(e: StructuredTagEntry): boolean {
  return e.isEncrypted && !usable(entryCache.get(e.id), e.encryptedPayload);
}
export function entryView(e: StructuredTagEntry): StructuredTagEntry {
  if (!e.isEncrypted) return e;
  const c = entryCache.get(e.id);
  if (usable(c, e.encryptedPayload)) return applyEntrySecrets(e, c.secrets);
  return { ...e, term: LOCKED_ENTRY_TERM };
}

// ── Crypto ───────────────────────────────────────────────────────────────────

export const decryptSecrets = async <S,>(payload: string): Promise<S> => JSON.parse(await decryptField(payload)) as S;
export const encryptSecrets = (secrets: unknown): Promise<string> => encryptField(JSON.stringify(secrets));

// One in-flight encryption per key, always encrypting the LATEST secrets: edits arrive far
// faster than encryption completes (every keystroke via autosave), and a naive "encrypt each
// edit" would let an older payload land after a newer one and silently revert the note.
interface Slot { latest: unknown; seq: number; onPayload: (payload: string) => void }
const slots = new Map<string, Slot>();
const pending = new Set<Promise<void>>();

export function queueEncrypt(key: string, secrets: unknown, onPayload: (payload: string) => void): void {
  const existing = slots.get(key);
  if (existing) { existing.latest = secrets; existing.seq++; existing.onPayload = onPayload; return; }
  const slot: Slot = { latest: secrets, seq: 0, onPayload };
  slots.set(key, slot);
  const run = (async () => {
    try {
      for (;;) {
        const seq = slot.seq;
        const payload = await encryptSecrets(slot.latest);
        if (slot.seq !== seq) continue; // a newer edit arrived mid-encrypt — encrypt that instead
        slot.onPayload(payload);
        return;
      }
    } catch (err) {
      console.error(`[noteSecrets] failed to encrypt ${key}; edit not persisted:`, err);
    } finally {
      slots.delete(key);
    }
  })();
  pending.add(run);
  void run.finally(() => pending.delete(run));
}

// Resolves once every queued re-encryption has landed — lockVault() awaits this so locking
// can never discard an edit that was still being encrypted.
export async function flushEncryptions(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
