import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Picture, PictureId, PictureOrigin } from '@/types/pictures';
import type { Note, NoteBackdropChoice, NoteId, NoteTagId, StructuredTagEntry } from '@/types/notes';
import type { NoteBackdrop } from '@/config/noteBackdrops';
import { usePictureStore } from '@/store/pictureStore';
import { useNoteStore } from '@/store/noteStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTrashStore } from '@/store/trashStore';
import { encryptField, decryptField, isVaultUnlocked, onVaultStatus } from '@/services/vault';
import { entryView, isEntryLocked, isNoteLocked, noteView } from '@/services/noteSecrets';
import { editNoteContent } from '@/services/noteContentEdit';
import { compressImageBlob, recompressDataUrl } from '@/utils/imageCompress';
import { now } from '@/utils/date';
import { log } from '@/utils/log';

// THE picture library (CLAUDE.md "Picture library", adopted 2026-10-17): a picture is stored once
// (store/pictureStore.ts) and referred to by id wherever it's used: a backdrop (note, notebook,
// app-wide), a picture in a note's text (the image node's `pictureId`) and a Glossary card's
// picture (`picture:<id>` in its field). Everything that adds, shows, places or deletes a picture
// goes through here, so a later move to file storage (Supabase Storage) changes only this file.
//
// Encryption (agreed 2026-10-17): whatever an encrypted note (or its Glossary entries) uses is
// stored encrypted. Adding a picture from an encrypted note encrypts it from the start. A plain
// picture that turns up in an encrypted note (chosen as its backdrop, pasted in, or the note was
// encrypted afterwards) is swapped for ONE shared encrypted copy (`copyOf`), and a plain picture
// added from a note or card that nothing plain uses any more is then removed, as encrypting the
// note used to remove its inline pictures from the server. Encrypted pictures show only while
// the vault is unlocked.

// ── Reading ─────────────────────────────────────────────────────────────────

// Decrypted encrypted pictures, in memory only, while the vault is unlocked; keyed by id, kept
// with the payload they came from so a changed payload is decrypted again.
const plainCache = new Map<string, { payload: string; src: string }>();
const usePicturesVersion = create<{ version: number }>()(() => ({ version: 0 }));
const bump = () => usePicturesVersion.setState((s) => ({ version: s.version + 1 }));

const all = () => usePictureStore.getState().pictures;

export function pictureSrc(id: string | null | undefined): string | null {
  const p = id ? all()[id as PictureId] : undefined;
  if (!p) return null;
  if (!p.isEncrypted) return p.src || null;
  const c = plainCache.get(p.id);
  return c && c.payload === p.encryptedPayload ? c.src : null;
}

export function usePictureSrc(id: string | null | undefined): string | null {
  usePictureStore((s) => (id ? s.pictures[id as PictureId] : undefined));
  usePicturesVersion((s) => s.version);
  return pictureSrc(id);
}

// For code outside React (an editor node view): called whenever any picture may have changed.
export function onPicturesChange(fn: () => void): () => void {
  const a = usePictureStore.subscribe(fn);
  const b = usePicturesVersion.subscribe(fn);
  return () => { a(); b(); };
}

// Whether two ids are the same picture: the same one, or one the encrypted copy of the other.
export function samePicture(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = all()[a as PictureId];
  const pb = all()[b as PictureId];
  return pa?.copyOf === b || pb?.copyOf === a;
}

// The backdrop pictures to offer (pictures in note text and on cards aren't offered). For an
// encrypted note: the plain ones and the encrypted ones that aren't a copy of one of those
// (choosing a plain one makes its copy). Otherwise only plain ones: an encrypted picture is never
// placed where it would be shown unencrypted. Newest first.
export function libraryFor(encrypted: boolean): Picture[] {
  const list = Object.values(all()).filter((p) => p.origin === 'backdrop');
  const plain = list.filter((p) => !p.isEncrypted);
  const plainIds = new Set(plain.map((p) => p.id));
  const shown = encrypted
    ? [...plain, ...list.filter((p) => p.isEncrypted && !(p.copyOf && plainIds.has(p.copyOf)) && pictureSrc(p.id))]
    : plain;
  return shown.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function usePictureLibrary(encrypted: boolean): Picture[] {
  usePictureStore((s) => s.pictures);
  usePicturesVersion((s) => s.version);
  return libraryFor(encrypted);
}

// ── Adding ──────────────────────────────────────────────────────────────────

interface AddOptions { encrypted: boolean; origin: PictureOrigin }

function put(src: string, origin: PictureOrigin, enc: { payload: string; copyOf: PictureId | null } | null): PictureId {
  const ts = now();
  const id = nanoid() as PictureId;
  usePictureStore.getState().putPicture({
    id, src: enc ? '' : src, isEncrypted: !!enc, encryptedPayload: enc?.payload ?? null,
    copyOf: enc?.copyOf ?? null, origin, createdAt: ts, updatedAt: ts,
  });
  if (enc) { plainCache.set(id, { payload: enc.payload, src }); bump(); }
  return id;
}

async function store(src: string, opts: AddOptions): Promise<PictureId> {
  if (opts.encrypted) return put(src, opts.origin, { payload: await encryptField(src), copyOf: null });
  const same = Object.values(all()).find((p) => !p.isEncrypted && p.origin === opts.origin && p.src === src);
  return same ? same.id : put(src, opts.origin, null);
}

// A file the person chose or pasted: compressed, then stored (an identical plain picture added
// the same way is reused). `encrypted` needs the vault unlocked (rejects otherwise).
export async function addPicture(file: Blob, opts: AddOptions): Promise<PictureId> {
  return store(await compressImageBlob(file), opts);
}

// A picture already held as a data URL (one inline in a note from before the library): shrunk
// if it's large, then stored.
export async function addPictureFromDataUrl(dataUrl: string, opts: AddOptions): Promise<PictureId> {
  return store(await recompressDataUrl(dataUrl), opts);
}

// The encrypted copy of a plain picture (made once, then reused); an encrypted picture is its own.
export async function encryptedCopyOf(id: PictureId): Promise<PictureId | null> {
  const p = all()[id];
  if (!p) return null;
  if (p.isEncrypted) return id;
  const existing = Object.values(all()).find((q) => q.isEncrypted && q.copyOf === id);
  return existing ? existing.id : put(p.src, p.origin, { payload: await encryptField(p.src), copyOf: id });
}

// ── A Glossary card's picture: `picture:<id>` in its image field ──────────

const REF = 'picture:';
export const pictureRef = (id: string) => `${REF}${id}`;
export const pictureIdOf = (value: string | null | undefined): string | null =>
  value?.startsWith(REF) ? value.slice(REF.length) : null;

// What an image field shows: its library picture, or (from before the library) the data URL itself.
export function useFieldPictureSrc(value: string): string | null {
  const fromLibrary = usePictureSrc(pictureIdOf(value));
  return pictureIdOf(value) ? fromLibrary : (value || null);
}

// ── Where a backdrop is set ─────────────────────────────────────────────────

export type BackdropTarget = { kind: 'note'; id: NoteId } | { kind: 'notebook'; id: NoteTagId } | { kind: 'app' };

// Sets a note's, notebook's or the app-wide backdrop. null on a note or notebook = as its
// notebook / parent; on the app = plain. A picture set on an encrypted note becomes its
// encrypted copy first.
export async function setBackdrop(target: BackdropTarget, choice: NoteBackdropChoice | null): Promise<void> {
  if (target.kind === 'app') {
    useSettingsStore.getState().setNoteBackdrop(choice && choice.kind !== 'plain' ? choice as NoteBackdrop : null);
    return;
  }
  if (target.kind === 'notebook') {
    useNoteStore.getState().updateNoteTag(target.id, { backdrop: choice });
    return;
  }
  const note = useNoteStore.getState().notes[target.id];
  if (!note) return;
  let c = choice;
  if (c?.kind === 'picture' && note.isEncrypted) {
    const copy = await encryptedCopyOf(c.pictureId);
    c = copy ? { kind: 'picture', pictureId: copy } : null;
  }
  useNoteStore.getState().updateNote(target.id, { backdrop: c });
}

// ── Where a picture is used, and deleting it ────────────────────────────────

// A picture and its copies count as one picture ("the same picture, everywhere").
function family(id: string): Set<string> {
  const root = all()[id as PictureId]?.copyOf ?? id;
  const ids = new Set<string>([root, id]);
  for (const p of Object.values(all())) if (p.copyOf === root) ids.add(p.id);
  return ids;
}

const usesPicture = (b: { kind: string; pictureId?: string } | null | undefined, ids: Set<string>) =>
  !!b && b.kind === 'picture' && !!b.pictureId && ids.has(b.pictureId);

// Where a backdrop picture is used (the picker's delete asks from this).
export function pictureUses(id: string): BackdropTarget[] {
  const ids = family(id);
  const { notes, noteTags } = useNoteStore.getState();
  const uses: BackdropTarget[] = [];
  for (const n of Object.values(notes)) if (usesPicture(n.backdrop, ids)) uses.push({ kind: 'note', id: n.id });
  for (const t of Object.values(noteTags)) if (usesPicture(t.backdrop, ids)) uses.push({ kind: 'notebook', id: t.id });
  if (usesPicture(useSettingsStore.getState().noteBackdrop, ids)) uses.push({ kind: 'app' });
  return uses;
}

// Takes a backdrop picture (and its copies) off everything that uses it, then out of the library.
// Those places fall back to their notebook's backdrop, or the plain one. Not to the Recycling Bin
// (decided with the user 2026-10-17). A locked encrypted note can't be changed: its reference
// stays, and shows the plain backdrop since the picture is gone.
export function deletePictureEverywhere(id: string): void {
  const ids = family(id);
  for (const use of pictureUses(id)) void setBackdrop(use, null);
  for (const pid of ids) { usePictureStore.getState().removePicture(pid as PictureId); plainCache.delete(pid); }
  bump();
}

// Every picture id a stored text holds: an image node's `"pictureId":"…"` or a card's `picture:…`.
export function pictureIdsIn(text: string): string[] {
  if (!text) return [];
  const ids: string[] = [];
  for (const m of text.matchAll(/"pictureId":"([^"]+)"|picture:([A-Za-z0-9_-]+)/g)) ids.push(m[1] ?? m[2]);
  return ids;
}

const noteText = (n: Note) => [n.content, ...n.tabs.map((t) => t.content)].join('\n');
const entryText = (e: StructuredTagEntry) => JSON.stringify(e.fields);

// Which pictures something plain still uses (notes, cards, backdrops, the Recycling Bin's
// snapshots), or null when that can't be known (a locked encrypted note or entry, or an encrypted
// snapshot in the bin): then nothing is removed.
function plainUses(): Set<string> | null {
  const used = new Set<string>();
  const add = (text: string) => { for (const id of pictureIdsIn(text)) used.add(id); };
  const { notes, noteTags, structuredTagEntries } = useNoteStore.getState();
  for (const n of Object.values(notes)) {
    if (n.isEncrypted) { if (isNoteLocked(n)) return null; continue; }
    add(noteText(n));
    if (n.backdrop?.kind === 'picture') used.add(n.backdrop.pictureId);
  }
  for (const e of Object.values(structuredTagEntries)) {
    if (e.isEncrypted) { if (isEntryLocked(e)) return null; continue; }
    add(entryText(e));
  }
  for (const t of Object.values(noteTags)) if (t.backdrop?.kind === 'picture') used.add(t.backdrop.pictureId);
  const app = useSettingsStore.getState().noteBackdrop;
  if (app?.kind === 'picture') used.add(app.pictureId);
  for (const t of Object.values(useTrashStore.getState().entries)) {
    const text = JSON.stringify(t.snapshot ?? null);
    if (/"isEncrypted":true/.test(text)) return null;
    add(text);
  }
  return used;
}

// ── Keeping things right ────────────────────────────────────────────────────

const replaceIds = (text: string, swap: Map<string, string>) =>
  text.replace(/("pictureId":")([^"]+)(")|(picture:)([A-Za-z0-9_-]+)/g, (m, a, id1, c, d, id2) => {
    const id = id1 ?? id2;
    const to = swap.get(id);
    if (!to) return m;
    return id1 ? `${a}${to}${c}` : `${d}${to}`;
  });

// Encrypted notes and entries already looked at, as of which change (refresh runs on every save,
// so each is read again only once it has changed).
const checked = new Map<string, string>();
const unchanged = (key: string, stamp: string) => {
  if (checked.get(key) === stamp) return true;
  checked.set(key, stamp);
  return false;
};

// Encrypted notes and entries (readable while unlocked) that hold plain pictures: each onto the
// picture's encrypted copy. Returns the plain pictures that were swapped out.
async function encryptPicturesOfEncrypted(): Promise<Set<string>> {
  const swappedOut = new Set<string>();
  const isPlain = (id: string) => { const p = all()[id as PictureId]; return !!p && !p.isEncrypted; };
  const copies = async (ids: string[]) => {
    const swap = new Map<string, string>();
    for (const id of new Set(ids.filter(isPlain))) {
      const copy = await encryptedCopyOf(id as PictureId);
      if (copy) { swap.set(id, copy); swappedOut.add(id); }
    }
    return swap;
  };

  for (const raw of Object.values(useNoteStore.getState().notes)) {
    if (!raw.isEncrypted || isNoteLocked(raw) || unchanged(`note:${raw.id}`, `${raw.updatedAt}|${raw.encryptedPayload}`)) continue;
    const n = noteView(raw);
    if (n.backdrop?.kind === 'picture' && isPlain(n.backdrop.pictureId)) {
      swappedOut.add(n.backdrop.pictureId);
      await setBackdrop({ kind: 'note', id: n.id }, n.backdrop);
    }
    for (const tab of [{ id: null as string | null, content: n.content }, ...n.tabs]) {
      const swap = await copies(pictureIdsIn(tab.content));
      if (swap.size === 0) continue;
      editNoteContent(n.id, tab.id, {
        inEditor: (tr) => {
          let changed = false;
          tr.doc.descendants((node, pos) => {
            const to = node.type.name === 'image' ? swap.get(node.attrs.pictureId) : undefined;
            if (to) { tr.setNodeMarkup(pos, undefined, { ...node.attrs, pictureId: to }); changed = true; }
          });
          return changed;
        },
        inJson: (json) => replaceIds(json, swap),
      }, { addToHistory: false });
    }
  }

  for (const raw of Object.values(useNoteStore.getState().structuredTagEntries)) {
    if (!raw.isEncrypted || isEntryLocked(raw) || unchanged(`entry:${raw.id}`, `${raw.updatedAt}|${raw.encryptedPayload}`)) continue;
    const e = entryView(raw);
    const swap = await copies(pictureIdsIn(entryText(e)));
    if (swap.size) useNoteStore.getState().updateStructuredTagEntry(e.id, { fields: JSON.parse(replaceIds(entryText(e), swap)) });
  }
  return swappedOut;
}

let refreshing = false;
let again = false;

async function refresh(): Promise<void> {
  if (refreshing) { again = true; return; }
  refreshing = true;
  try {
    do {
      again = false;
      if (!isVaultUnlocked()) {
        checked.clear();
        if (plainCache.size) { plainCache.clear(); bump(); }
        continue;
      }
      for (const p of Object.values(all())) {
        if (!p.isEncrypted || !p.encryptedPayload || plainCache.get(p.id)?.payload === p.encryptedPayload) continue;
        try {
          plainCache.set(p.id, { payload: p.encryptedPayload, src: await decryptField(p.encryptedPayload) });
          bump();
        } catch (err) {
          log.error('pictures', 'could not decrypt picture', p.id, err);
        }
      }
      const swappedOut = await encryptPicturesOfEncrypted();
      // A plain note showing an encrypted copy as its backdrop (the note was decrypted): back to
      // the plain original, where there is one.
      for (const n of Object.values(useNoteStore.getState().notes)) {
        const pic = n.backdrop?.kind === 'picture' ? all()[n.backdrop.pictureId] : undefined;
        if (!n.isEncrypted && pic?.isEncrypted && pic.copyOf && all()[pic.copyOf]) {
          useNoteStore.getState().updateNote(n.id, { backdrop: { kind: 'picture', pictureId: pic.copyOf } });
        }
      }
      // A plain picture from a note or card that only encrypted ones use now: off the server.
      // (Backdrop pictures stay: they're the person's library, deleted from the picker.)
      if (swappedOut.size) {
        const used = plainUses();
        if (used) {
          for (const id of swappedOut) {
            const p = all()[id as PictureId];
            if (p && p.origin !== 'backdrop' && !used.has(id)) usePictureStore.getState().removePicture(p.id);
          }
        }
      }
    } while (again);
  } catch (err) {
    log.error('pictures', 'refresh failed', err);
  } finally {
    refreshing = false;
  }
}

// The app-wide picture from before the library (an inline data URL): into the library.
function moveLegacyBackdrop(): void {
  const b = useSettingsStore.getState().noteBackdrop;
  if (b?.kind !== 'image') return;
  const same = Object.values(all()).find((p) => !p.isEncrypted && p.origin === 'backdrop' && p.src === b.src);
  useSettingsStore.getState().setNoteBackdrop({ kind: 'picture', pictureId: same ? same.id : put(b.src, 'backdrop', null) });
}

let started = false;
export function initPictures(): void {
  if (started) return;
  started = true;
  moveLegacyBackdrop();
  onVaultStatus(() => { void refresh(); });
  usePictureStore.subscribe((s, prev) => { if (s.pictures !== prev.pictures) void refresh(); });
  useNoteStore.subscribe((s, prev) => { if (s.notes !== prev.notes || s.structuredTagEntries !== prev.structuredTagEntries) void refresh(); });
  void refresh();
}

// For tests.
export function resetPicturesCache(): void { plainCache.clear(); checked.clear(); started = false; }
