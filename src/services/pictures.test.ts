// The picture library (services/pictures.ts): stored once, encrypted copies for encrypted notes,
// where a picture is used, deleting it everywhere or from one place, pictures in note text and on
// cards. The vault is faked ("enc:" + the text) so encryption is deterministic; compression is
// faked too (jsdom has no canvas).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const vault = vi.hoisted(() => ({
  unlocked: true,
  listeners: [] as ((s: string) => void)[],
}));
vi.mock('@/services/vault', () => ({
  encryptField: async (s: string) => { if (!vault.unlocked) throw new Error('Vault is locked'); return `enc:${s}`; },
  decryptField: async (s: string) => s.slice(4),
  isVaultUnlocked: () => vault.unlocked,
  onVaultStatus: (fn: (s: string) => void) => { vault.listeners.push(fn); return () => {}; },
}));
vi.mock('@/utils/imageCompress', () => ({
  compressImageBlob: async (b: Blob) => `data:image/webp;base64,${await b.text()}`,
  recompressDataUrl: async (s: string) => s,
}));

const { usePictureStore } = await import('@/store/pictureStore');
const { useNoteStore } = await import('@/store/noteStore');
const { useSettingsStore } = await import('@/store/settingsStore');
const { useTrashStore } = await import('@/store/trashStore');
const { putNoteSecrets, extractNoteSecrets, noteView } = await import('@/services/noteSecrets');
const pics = await import('./pictures');

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const file = (text: string) => new Blob([text]);
const doc = (...nodes: object[]) => JSON.stringify({ type: 'doc', content: nodes });
const img = (attrs: object) => ({ type: 'image', attrs });

function makeNote(encrypted = false, content = '') {
  const id = useNoteStore.getState().addNote({ title: 'N', content });
  if (encrypted) {
    const n = useNoteStore.getState().notes[id];
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [id]: { ...n, isEncrypted: true, encryptedPayload: 'p0' } } }));
    putNoteSecrets(id, extractNoteSecrets(n), 'p0');
  }
  return id;
}

beforeEach(() => {
  vault.unlocked = true;
  usePictureStore.setState(usePictureStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
  useSettingsStore.setState({ noteBackdrop: null });
  pics.resetPicturesCache();
});

describe('the picture library', () => {
  it('stores a picture once: the same file added twice is one picture', async () => {
    const a = await pics.addPicture(file('cat'), { encrypted: false, origin: 'backdrop' });
    const b = await pics.addPicture(file('cat'), { encrypted: false, origin: 'backdrop' });
    expect(b).toBe(a);
    expect(Object.keys(usePictureStore.getState().pictures)).toHaveLength(1);
    expect(pics.pictureSrc(a)).toBe('data:image/webp;base64,cat');
  });

  it('an encrypted note gets ONE encrypted copy of a plain picture, shared by every encrypted note', async () => {
    const pic = await pics.addPicture(file('cat'), { encrypted: false, origin: 'backdrop' });
    const n1 = makeNote(true);
    const n2 = makeNote(true);
    await pics.setBackdrop({ kind: 'note', id: n1 }, { kind: 'picture', pictureId: pic });
    await pics.setBackdrop({ kind: 'note', id: n2 }, { kind: 'picture', pictureId: pic });
    const b1 = useNoteStore.getState().notes[n1].backdrop;
    const b2 = useNoteStore.getState().notes[n2].backdrop;
    expect(b1).toEqual(b2);
    const copy = usePictureStore.getState().pictures[(b1 as { pictureId: string }).pictureId as never];
    expect(copy).toMatchObject({ isEncrypted: true, src: '', copyOf: pic, encryptedPayload: 'enc:data:image/webp;base64,cat' });
    expect(pics.pictureSrc(copy.id)).toBe('data:image/webp;base64,cat');
    expect(Object.keys(usePictureStore.getState().pictures)).toHaveLength(2);
  });

  it('a picture added from an encrypted note is encrypted from the start; locked, it can not be added', async () => {
    const id = await pics.addPicture(file('secret'), { encrypted: true, origin: 'backdrop' });
    expect(usePictureStore.getState().pictures[id]).toMatchObject({ isEncrypted: true, src: '', copyOf: null });
    vault.unlocked = false;
    await expect(pics.addPicture(file('x'), { encrypted: true, origin: 'backdrop' })).rejects.toThrow(/locked/);
  });

  it('the backdrop picker offers only backdrop pictures; an encrypted note also its own encrypted ones, not copies of listed ones', async () => {
    const plain = await pics.addPicture(file('cat'), { encrypted: false, origin: 'backdrop' });
    await pics.encryptedCopyOf(plain);
    const own = await pics.addPicture(file('secret'), { encrypted: true, origin: 'backdrop' });
    await pics.addPicture(file('pasted'), { encrypted: false, origin: 'note' });
    await pics.addPicture(file('card'), { encrypted: false, origin: 'card' });
    expect(pics.libraryFor(false).map((p) => p.id)).toEqual([plain]);
    expect(pics.libraryFor(true).map((p) => p.id).sort()).toEqual([plain, own].sort());
  });

  it('where a picture is used counts its copies; deleting everywhere clears every use and the copies', async () => {
    const pic = await pics.addPicture(file('cat'), { encrypted: false, origin: 'backdrop' });
    const plainNote = makeNote();
    const encNote = makeNote(true);
    const nb = useNoteStore.getState().addNoteTag({ name: 'Uni', kind: 'area' });
    await pics.setBackdrop({ kind: 'note', id: plainNote }, { kind: 'picture', pictureId: pic });
    await pics.setBackdrop({ kind: 'note', id: encNote }, { kind: 'picture', pictureId: pic });
    await pics.setBackdrop({ kind: 'notebook', id: nb }, { kind: 'picture', pictureId: pic });
    await pics.setBackdrop({ kind: 'app' }, { kind: 'picture', pictureId: pic });
    expect(pics.pictureUses(pic)).toHaveLength(4);

    pics.deletePictureEverywhere(pic);
    await tick();
    const { notes, noteTags } = useNoteStore.getState();
    expect(notes[plainNote].backdrop).toBeNull();
    expect(notes[encNote].backdrop).toBeNull();
    expect(noteTags[nb].backdrop).toBeNull();
    expect(useSettingsStore.getState().noteBackdrop).toBeNull();
    expect(usePictureStore.getState().pictures).toEqual({});
  });

  it('"just from here" leaves the picture in the library for the other places', async () => {
    const pic = await pics.addPicture(file('cat'), { encrypted: false, origin: 'backdrop' });
    const a = makeNote();
    const b = makeNote();
    await pics.setBackdrop({ kind: 'note', id: a }, { kind: 'picture', pictureId: pic });
    await pics.setBackdrop({ kind: 'note', id: b }, { kind: 'picture', pictureId: pic });
    await pics.setBackdrop({ kind: 'note', id: a }, null);
    expect(pics.pictureUses(pic)).toEqual([{ kind: 'note', id: b }]);
    expect(usePictureStore.getState().pictures[pic]).toBeDefined();
  });

  it('on start: the old inline app-wide picture moves into the library; an encrypted note showing a plain picture moves onto its copy', async () => {
    useSettingsStore.setState({ noteBackdrop: { kind: 'image', src: 'data:image/webp;base64,old' } });
    const pic = await pics.addPicture(file('cat'), { encrypted: false, origin: 'backdrop' });
    const n = makeNote(true);
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [n]: { ...s.notes[n], backdrop: { kind: 'picture', pictureId: pic } } } }));

    pics.initPictures();
    await settle();

    const app = useSettingsStore.getState().noteBackdrop;
    expect(app?.kind).toBe('picture');
    expect(pics.pictureSrc((app as { pictureId: string }).pictureId)).toBe('data:image/webp;base64,old');
    const now = useNoteStore.getState().notes[n].backdrop as { pictureId: string };
    expect(usePictureStore.getState().pictures[now.pictureId as never]).toMatchObject({ isEncrypted: true, copyOf: pic });
  });

  it('locked: an encrypted picture shows nothing', async () => {
    const id = await pics.addPicture(file('secret'), { encrypted: true, origin: 'backdrop' });
    pics.resetPicturesCache();
    vault.unlocked = false;
    expect(pics.pictureSrc(id)).toBeNull();
  });
});

describe('pictures in note text and on cards', () => {
  it('finds picture ids in stored text: image nodes and card references', () => {
    expect(pics.pictureIdsIn(doc(img({ pictureId: 'a1' }), img({ pictureId: null })))).toEqual(['a1']);
    expect(pics.pictureIdsIn(JSON.stringify({ image: pics.pictureRef('c_9-x') }))).toEqual(['c_9-x']);
    expect(pics.pictureIdOf('picture:abc')).toBe('abc');
    expect(pics.pictureIdOf('data:image/png;base64,x')).toBeNull();
  });

  it('a note encrypted after a picture was pasted in: its text moves onto the encrypted copy and the plain one leaves the server', async () => {
    const pic = await pics.addPicture(file('scan'), { encrypted: false, origin: 'note' });
    const n = makeNote(true, doc(img({ pictureId: pic, src: null })));
    pics.initPictures();
    await settle();
    const content = noteView(useNoteStore.getState().notes[n]).content;
    const [now] = pics.pictureIdsIn(content);
    expect(now).not.toBe(pic);
    expect(usePictureStore.getState().pictures[now as never]).toMatchObject({ isEncrypted: true, origin: 'note' });
    expect(usePictureStore.getState().pictures[pic]).toBeUndefined();
    expect(pics.pictureSrc(now)).toBe('data:image/webp;base64,scan');
  });

  it('the plain picture stays while a plain note still uses it', async () => {
    const pic = await pics.addPicture(file('scan'), { encrypted: false, origin: 'note' });
    makeNote(false, doc(img({ pictureId: pic, src: null })));
    makeNote(true, doc(img({ pictureId: pic, src: null })));
    pics.initPictures();
    await settle();
    expect(usePictureStore.getState().pictures[pic]).toBeDefined();
  });

  it('nothing plain is removed while a locked encrypted note could still use it', async () => {
    const pic = await pics.addPicture(file('scan'), { encrypted: false, origin: 'note' });
    makeNote(true, doc(img({ pictureId: pic, src: null })));
    const locked = useNoteStore.getState().addNote({ title: 'L' });
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [locked]: { ...s.notes[locked], isEncrypted: true, encryptedPayload: 'zz' } } }));
    pics.initPictures();
    await settle();
    expect(usePictureStore.getState().pictures[pic]).toBeDefined();
  });
});
