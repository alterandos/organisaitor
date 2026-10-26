// Encryption by scope, end to end on the stores: the enforcer encrypts what a notebook or an
// Endeavour covers (once the vault is unlocked), sync holds it until then, and nothing planted in a
// covered note or list ever reaches a sync row while it isn't encrypted. The vault is faked (its
// crypto is tested for real in vault.test.ts): its "ciphertext" is base64, so a planted secret never
// appears in it verbatim.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vault = vi.hoisted(() => {
  let unlocked = false;
  const listeners = new Set<(s: string) => void>();
  const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  return {
    setUnlocked(v: boolean) { unlocked = v; listeners.forEach((l) => l(v ? 'unlocked' : 'locked')); },
    isVaultUnlocked: () => unlocked,
    onVaultStatus: (fn: (s: string) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    registerBeforeLock: () => () => {},
    encryptField: async (p: string) => { if (!unlocked) throw new Error('Vault is locked'); return `enc:${b64(p)}`; },
    decryptField: async (e: string) => new TextDecoder().decode(Uint8Array.from(atob(e.slice(4)), (c) => c.charCodeAt(0))),
  };
});
vi.mock('@/services/vault', () => vault);

const { useNoteStore } = await import('@/store/noteStore');
const { useListStore } = await import('@/store/listStore');
const { useTaskStore } = await import('@/store/taskStore');
const { initEncryptionScopes, encryptAllWaiting, resetEncryptionEnforcerForTests } = await import('./enforcer');
const { heldFromSync, waitingForEncryption, ENCRYPTABLE_KINDS } = await import('./kinds');
const { noteToRow, listToRow, listItemToRow } = await import('@/services/sync/mappers');
const { clearSecretsCache } = await import('@/services/noteSecrets');

const SECRET = 'PLANTED-SECRET-7731';
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useListStore.setState(useListStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  clearSecretsCache();
  vault.setUnlocked(false);
});
afterEach(() => resetEncryptionEnforcerForTests());

function encryptedNotebook(): string {
  const id = useNoteStore.getState().addNoteTag({ name: 'Private', kind: 'area', parentTagId: null } as never);
  useNoteStore.getState().updateNoteTag(id, { encryptContents: true });
  return id;
}

describe('the enforcer', () => {
  it('encrypts a note made in an encrypted notebook straight away when the vault is unlocked', async () => {
    vault.setUnlocked(true);
    initEncryptionScopes();
    const nb = encryptedNotebook();
    const id = useNoteStore.getState().addNote({ title: SECRET, content: SECRET, tagIds: [nb as never] });
    await settle();
    const n = useNoteStore.getState().notes[id];
    expect(n.isEncrypted).toBe(true);
    expect(JSON.stringify(noteToRow(n, 'u1'))).not.toContain(SECRET);
    expect(waitingForEncryption()).toEqual([]);
  });

  it('a note made while locked waits, is held from sync, and is encrypted on unlock', async () => {
    initEncryptionScopes();
    const nb = encryptedNotebook();
    const id = useNoteStore.getState().addNote({ title: SECRET, tagIds: [nb as never] });
    await settle();
    const n = useNoteStore.getState().notes[id];
    expect(n.isEncrypted).toBe(false);
    expect(heldFromSync('notes', n)).toBe(true);
    expect(waitingForEncryption().map((w) => w.id)).toEqual([id]);

    vault.setUnlocked(true);
    await settle();
    const after = useNoteStore.getState().notes[id];
    expect(after.isEncrypted).toBe(true);
    expect(heldFromSync('notes', after)).toBe(false);
  });

  it('turning a notebook on encrypts the notes already in it (and inside its sub-notebooks)', async () => {
    vault.setUnlocked(true);
    initEncryptionScopes();
    const top = useNoteStore.getState().addNoteTag({ name: 'Top', kind: 'area', parentTagId: null } as never);
    const sub = useNoteStore.getState().addNoteTag({ name: 'Sub', kind: 'area', parentTagId: top } as never);
    const a = useNoteStore.getState().addNote({ title: 'a', tagIds: [top as never] });
    const b = useNoteStore.getState().addNote({ title: 'b', tagIds: [sub as never] });
    const c = useNoteStore.getState().addNote({ title: 'c', tagIds: [] });
    await settle();
    expect(useNoteStore.getState().notes[a].isEncrypted).toBe(false);

    useNoteStore.getState().updateNoteTag(top, { encryptContents: true });
    expect(await encryptAllWaiting()).toBe(0);
    const { notes } = useNoteStore.getState();
    expect([notes[a].isEncrypted, notes[b].isEncrypted, notes[c].isEncrypted]).toEqual([true, true, false]);
  });

  it('turning it off leaves encrypted notes encrypted, and new ones plain', async () => {
    vault.setUnlocked(true);
    initEncryptionScopes();
    const nb = encryptedNotebook();
    const a = useNoteStore.getState().addNote({ title: 'a', tagIds: [nb as never] });
    await encryptAllWaiting();
    useNoteStore.getState().updateNoteTag(nb as never, { encryptContents: false });
    const b = useNoteStore.getState().addNote({ title: 'b', tagIds: [nb as never] });
    await settle();
    expect(useNoteStore.getState().notes[a].isEncrypted).toBe(true);
    expect(useNoteStore.getState().notes[b].isEncrypted).toBe(false);
  });

  it('a note moved into an encrypted notebook is encrypted; moved out, it stays encrypted', async () => {
    vault.setUnlocked(true);
    initEncryptionScopes();
    const nb = encryptedNotebook();
    const id = useNoteStore.getState().addNote({ title: 'x', tagIds: [] });
    await settle();
    expect(useNoteStore.getState().notes[id].isEncrypted).toBe(false);
    useNoteStore.getState().updateNote(id, { tagIds: [nb as never] });
    await encryptAllWaiting();
    expect(useNoteStore.getState().notes[id].isEncrypted).toBe(true);
  });

  it('an Endeavour encrypts the lists and notes filed under it, and a list’s items with it', async () => {
    vault.setUnlocked(true);
    initEncryptionScopes();
    const e = useTaskStore.getState().addCollection({ kind: 'project', name: 'Health' } as never);
    const list = useListStore.getState().addList({ name: SECRET, kind: 'reference', collectionId: e } as never);
    const item = useListStore.getState().addListItem({ listId: list, title: SECRET } as never);
    const n = useNoteStore.getState().addNote({ title: SECRET, tagIds: [], collectionId: e });
    await settle();
    expect(useListStore.getState().lists[list].isEncrypted).toBe(false);
    expect(heldFromSync('list_items', useListStore.getState().listItems[item])).toBe(false);

    vault.setUnlocked(false);
    useTaskStore.getState().updateCollection(e, { encryptContents: true });
    expect(heldFromSync('lists', useListStore.getState().lists[list])).toBe(true);
    expect(heldFromSync('list_items', useListStore.getState().listItems[item])).toBe(true);
    vault.setUnlocked(true);
    expect(await encryptAllWaiting()).toBe(0);
    const s = useListStore.getState();
    expect(s.lists[list].isEncrypted).toBe(true);
    expect(s.listItems[item].isEncrypted).toBe(true);
    expect(useNoteStore.getState().notes[n].isEncrypted).toBe(true);
    expect(JSON.stringify([listToRow(s.lists[list], 'u'), listItemToRow(s.listItems[item], 'u')])).not.toContain(SECRET);
  });

  it('encryptAllWaiting reports what’s still waiting while the vault is locked', async () => {
    initEncryptionScopes();
    const nb = encryptedNotebook();
    useNoteStore.getState().addNote({ title: 'a', tagIds: [nb as never] });
    expect(await encryptAllWaiting()).toBe(1);
  });
});

describe('the registry', () => {
  it('holds nothing outside a scope, and every kind holds its own table', () => {
    const id = useNoteStore.getState().addNote({ title: 'plain', tagIds: [] });
    expect(heldFromSync('notes', useNoteStore.getState().notes[id])).toBe(false);
    expect(heldFromSync('tasks', { id: 't' })).toBe(false);
    for (const k of ENCRYPTABLE_KINDS) expect(Object.keys(k.holds).length).toBeGreaterThan(0);
  });

  it('holds a Recycling Bin snapshot of a covered note deleted before it was encrypted', () => {
    const nb = encryptedNotebook();
    const snapshot = { title: SECRET, tagIds: [nb], collectionId: null, isEncrypted: false };
    expect(heldFromSync('trash_items', { kind: 'note', snapshot })).toBe(true);
    expect(heldFromSync('trash_items', { kind: 'note', snapshot: { ...snapshot, isEncrypted: true } })).toBe(false);
    expect(heldFromSync('trash_items', { kind: 'note', snapshot: { ...snapshot, tagIds: [] } })).toBe(false);
  });
});
