// Port of the "the stored note, its sync row and its structured entries contain none of a set
// of planted secret strings" harness (CLAUDE.md "Client-side encryption for Notes —
// comprehensive"), scoped to noteSecrets.ts's own logic — the memory-only plaintext cache, the
// view functions, and the serialised re-encrypt queue. Vault crypto itself is exercised for
// real in vault.test.ts; here @/services/vault is faked so the queue's ordering guarantee can
// be tested deterministically instead of racing real async crypto.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note, StructuredTagEntry } from '@/types/notes';

const hoisted = vi.hoisted(() => {
  const calls: { plaintext: string; resolve: (v: string) => void }[] = [];
  return {
    calls,
    encryptField: (plaintext: string) => new Promise<string>((resolve) => { calls.push({ plaintext, resolve }); }),
    decryptField: async (payload: string) => payload, // identity — the fake "ciphertext" IS the plaintext JSON
  };
});
vi.mock('@/services/vault', () => ({ encryptField: hoisted.encryptField, decryptField: hoisted.decryptField }));

const {
  isNoteLocked, noteView, isEntryLocked, entryView,
  putNoteSecrets, dropNoteSecrets, putEntrySecrets, dropEntrySecrets, clearSecretsCache,
  useSecretsVersion, queueEncrypt, flushEncryptions, decryptSecrets, LOCKED_NOTE_TITLE, LOCKED_ENTRY_TERM,
} = await import('@/services/noteSecrets');

const tick = () => new Promise((r) => setTimeout(r, 0));

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1' as never, title: '', content: '', tagIds: [], tagData: {}, createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z', abstract: null, lastViewedAt: null, archivedAt: null, color: null,
    pinned: false, userId: 'u1', parentId: null, tabs: [], mainTabName: 'Main', tabOrder: [], templateId: null,
    collectionId: null, isEncrypted: true, encryptedPayload: 'cipher-v1', ...overrides,
  };
}

function entry(overrides: Partial<StructuredTagEntry> = {}): StructuredTagEntry {
  return {
    id: 'e1' as never, typeKey: 'acronym', tagId: 'tag-1', term: '', fields: {}, noteId: 'n1' as never,
    collectionId: null, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
    isEncrypted: true, encryptedPayload: 'cipher-v1', ...overrides,
  };
}

beforeEach(() => {
  clearSecretsCache();
  hoisted.calls.length = 0;
});

describe('noteView / isNoteLocked', () => {
  it('a non-encrypted note passes straight through, always unlocked', () => {
    const n = note({ isEncrypted: false, title: 'Plain' });
    expect(isNoteLocked(n)).toBe(false);
    expect(noteView(n)).toEqual(n);
  });

  it('an encrypted note with nothing cached shows the locked placeholder', () => {
    const n = note();
    expect(isNoteLocked(n)).toBe(true);
    expect(noteView(n).title).toBe(LOCKED_NOTE_TITLE);
  });

  it('a cache entry whose payload matches the note\'s current encryptedPayload unlocks it', () => {
    const n = note({ encryptedPayload: 'cipher-v1' });
    putNoteSecrets('n1', { v: 1, title: 'Real title', content: 'body', abstract: null, tabs: [], mainTabName: 'Main', tagData: {} }, 'cipher-v1');
    expect(isNoteLocked(n)).toBe(false);
    expect(noteView(n).title).toBe('Real title');
  });

  it('a STALE cache entry (payload no longer matches — a sync pull replaced it) re-locks the note', () => {
    putNoteSecrets('n1', { v: 1, title: 'Old decrypted title', content: '', abstract: null, tabs: [], mainTabName: 'Main', tagData: {} }, 'cipher-v1');
    const n = note({ encryptedPayload: 'cipher-v2' }); // payload moved on without us
    expect(isNoteLocked(n)).toBe(true);
    expect(noteView(n).title).toBe(LOCKED_NOTE_TITLE);
  });

  it('a DIRTY cache entry stays usable even though its payload is stale — the plaintext is still the truth', () => {
    putNoteSecrets('n1', { v: 1, title: 'In-flight edit', content: '', abstract: null, tabs: [], mainTabName: 'Main', tagData: {} }, 'cipher-v1', true);
    const n = note({ encryptedPayload: 'cipher-v2' }); // re-encryption hasn't landed yet
    expect(isNoteLocked(n)).toBe(false);
    expect(noteView(n).title).toBe('In-flight edit');
  });

  it('dropNoteSecrets re-locks it and bumps the cache version', () => {
    putNoteSecrets('n1', { v: 1, title: 'X', content: '', abstract: null, tabs: [], mainTabName: 'Main', tagData: {} }, 'cipher-v1');
    const before = useSecretsVersion.getState().version;
    dropNoteSecrets('n1');
    expect(useSecretsVersion.getState().version).toBeGreaterThan(before);
    expect(isNoteLocked(note())).toBe(true);
  });
});

describe('entryView / isEntryLocked — same mechanism, for structured tag entries', () => {
  it('locked by default, unlocked once cached against the matching payload', () => {
    const e = entry();
    expect(isEntryLocked(e)).toBe(true);
    expect(entryView(e).term).toBe(LOCKED_ENTRY_TERM);

    putEntrySecrets('e1', { v: 1, term: 'ASX', fields: {} }, 'cipher-v1');
    expect(isEntryLocked(e)).toBe(false);
    expect(entryView(e).term).toBe('ASX');
  });

  it('dropEntrySecrets forgets it', () => {
    putEntrySecrets('e1', { v: 1, term: 'ASX', fields: {} }, 'cipher-v1');
    dropEntrySecrets('e1');
    expect(isEntryLocked(entry())).toBe(true);
  });
});

describe('clearSecretsCache', () => {
  it('drops everything (notes and entries) in one call', () => {
    putNoteSecrets('n1', { v: 1, title: 'X', content: '', abstract: null, tabs: [], mainTabName: 'Main', tagData: {} }, 'cipher-v1');
    putEntrySecrets('e1', { v: 1, term: 'X', fields: {} }, 'cipher-v1');
    clearSecretsCache();
    expect(isNoteLocked(note())).toBe(true);
    expect(isEntryLocked(entry())).toBe(true);
  });

  it('is a silent no-op (no version bump) when already empty', () => {
    const before = useSecretsVersion.getState().version;
    clearSecretsCache();
    expect(useSecretsVersion.getState().version).toBe(before);
  });
});

describe('queueEncrypt — the serialised re-encrypt queue', () => {
  it('a newer edit arriving mid-encryption wins: the callback tied to the superseded value never fires, only the latest does', async () => {
    let resultA: string | null = null;
    let resultB: string | null = null;

    queueEncrypt('note:1', { title: 'A' }, (p) => { resultA = p; });
    expect(hoisted.calls.length).toBe(1); // one encryptField call in flight, for A

    // A newer edit arrives before A's encryption has resolved — queueEncrypt must NOT start a
    // second concurrent encryptField call; it just updates what the in-flight loop will send next.
    queueEncrypt('note:1', { title: 'B' }, (p) => { resultB = p; });
    expect(hoisted.calls.length).toBe(1);

    hoisted.calls[0].resolve(JSON.stringify({ title: 'A' })); // A's own encryption finishes...
    await tick();
    // ...but since a newer edit (B) arrived while it was in flight, the loop re-encrypts B instead
    // of delivering A's now-stale result.
    expect(hoisted.calls.length).toBe(2);
    expect(resultA).toBeNull();

    hoisted.calls[1].resolve(JSON.stringify({ title: 'B' }));
    await flushEncryptions();
    expect(resultB).toBe(JSON.stringify({ title: 'B' }));
  });

  it('25 rapid edits to the same key end on the LAST value in the delivered payload, not the first', async () => {
    let delivered: string | null = null;
    // All 25 land synchronously, before the first encryptField call has any chance to resolve —
    // queueEncrypt collapses them onto the one in-flight slot rather than starting new work.
    for (let i = 0; i < 25; i++) {
      queueEncrypt('note:2', { n: i }, (p) => { delivered = p; });
    }
    expect(hoisted.calls.length).toBe(1);
    expect(hoisted.calls[0].plaintext).toBe(JSON.stringify({ n: 0 })); // the run started encrypting the FIRST edit...

    // Resolve whatever's in flight, letting the loop re-encrypt if a newer edit superseded it,
    // until the callback finally fires.
    let resolvedIndex = 0;
    while (delivered === null) {
      const call = hoisted.calls[resolvedIndex++];
      call.resolve(call.plaintext);
      await tick();
    }
    // ...but the actually-delivered payload reflects the LAST edit queued, not the first.
    expect(JSON.parse(delivered)).toEqual({ n: 24 });
  });

  it('different keys encrypt independently and concurrently', async () => {
    let a: string | null = null, b: string | null = null;
    queueEncrypt('note:a', { v: 'A' }, (p) => { a = p; });
    queueEncrypt('note:b', { v: 'B' }, (p) => { b = p; });
    expect(hoisted.calls.length).toBe(2);
    hoisted.calls[0].resolve(JSON.stringify({ v: 'A' }));
    hoisted.calls[1].resolve(JSON.stringify({ v: 'B' }));
    await flushEncryptions();
    expect(a).toBe(JSON.stringify({ v: 'A' }));
    expect(b).toBe(JSON.stringify({ v: 'B' }));
  });

  it('flushEncryptions resolves only once every in-flight encryption has actually landed', async () => {
    let landed = false;
    queueEncrypt('note:3', { x: 1 }, () => { landed = true; });
    const flush = flushEncryptions().then(() => { expect(landed).toBe(true); });
    await tick();
    hoisted.calls[0].resolve(JSON.stringify({ x: 1 }));
    await flush;
  });

  it('decryptSecrets parses the payload back into the original object', async () => {
    const payload = JSON.stringify({ v: 1, title: 'hi' });
    expect(await decryptSecrets(payload)).toEqual({ v: 1, title: 'hi' });
  });
});
