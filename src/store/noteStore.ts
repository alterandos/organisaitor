import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { Note, NoteTab, NoteTag, NoteId, NoteTagId, CreateNoteInput, CreateNoteTagInput, NoteTagFieldDef, StructuredTagEntry, StructuredTagEntryId, CollectionId } from '@/types';
import { newNoteId, newNoteTagId, newStructuredTagEntryId } from '@/utils/id';
import { now } from '@/utils/date';
import { resolveNoteInheritedCollectionId } from '@/utils/notes';
import { useRecentItemsStore } from '@/store/recentItemsStore';
import {
  noteView, isNoteLocked, extractNoteSecrets, blankNoteSecrets, applyNoteSecrets, entryView, isEntryLocked,
  extractEntrySecrets, blankEntrySecrets,
  putNoteSecrets, dropNoteSecrets, putEntrySecrets, dropEntrySecrets,
  queueEncrypt, encryptSecrets, decryptSecrets, type NoteSecrets, type EntrySecrets,
} from '@/services/noteSecrets';
import { decryptField } from '@/services/vault';
import { persistStorageIdb } from '@/utils/idbStorage';
import { moveToTrash } from '@/services/trashCapture';

interface NoteData {
  notes: Record<NoteId, Note>;
  noteTags: Record<NoteTagId, NoteTag>;
  structuredTagEntries: Record<StructuredTagEntryId, StructuredTagEntry>;
}

const EMPTY: NoteData = {
  notes: {},
  noteTags: {},
  structuredTagEntries: {},
};

export interface NoteActions {
  // Notes
  addNote: (input: CreateNoteInput) => NoteId;
  updateNote: (id: NoteId, changes: Partial<Omit<Note, 'id' | 'createdAt' | 'userId'>>) => void;
  // Encryption (see src/services/noteSecrets.ts). encryptNote needs the vault UNLOCKED (rejects
  // otherwise); decryptNote also needs the note's plaintext available (rejects if locked).
  encryptNote: (id: NoteId) => Promise<void>;
  decryptNote: (id: NoteId) => Promise<void>;
  upgradeLegacyEncryptedNote: (id: NoteId) => Promise<void>;
  touchNote: (id: NoteId) => void;   // Update lastViewedAt without changing updatedAt
  deleteNote: (id: NoteId) => void;

  // Note parent/child (indent/outdent)
  indentNote: (id: NoteId, newParentId: NoteId) => void;
  outdentNote: (id: NoteId) => void;

  // Note tabs
  addNoteTab: (noteId: NoteId, name: string) => string;
  removeNoteTab: (noteId: NoteId, tabId: string) => void;
  renameNoteTab: (noteId: NoteId, tabId: string, name: string) => void;
  renameMainTab: (noteId: NoteId, name: string) => void;
  updateNoteTabContent: (noteId: NoteId, tabId: string, content: string) => void;
  reorderNoteTabs: (noteId: NoteId, newOrder: string[]) => void;

  // Note Tags
  addNoteTag: (input: CreateNoteTagInput) => NoteTagId;
  updateNoteTag: (id: NoteTagId, changes: Partial<Omit<NoteTag, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>) => void;
  deleteNoteTag: (id: NoteTagId) => void;

  // Note tag indent/outdent (hierarchy)
  indentNoteTag: (id: NoteTagId) => void;
  outdentNoteTag: (id: NoteTagId) => void;

  // Structured tag entries (see src/config/structuredTagTypes.ts and types/notes.ts)
  addStructuredTagEntry: (input: {
    typeKey: string; tagId: string; term: string; fields: Record<string, unknown>;
    noteId: NoteId; collectionId: CollectionId | null;
  }) => StructuredTagEntryId;
  updateStructuredTagEntry: (id: StructuredTagEntryId, changes: Partial<Pick<StructuredTagEntry, 'term' | 'fields' | 'collectionId'>>) => void;
  deleteStructuredTagEntry: (id: StructuredTagEntryId) => void;

  // Queries
  getNotesByTag: (tagId: NoteTagId) => Note[];
  getChildTags: (parentTagId: NoteTagId | null) => NoteTag[];
  getRootTags: () => NoteTag[];
}

type NoteStore = NoteData & NoteActions;

export const useNoteStore = create<NoteStore>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      // ── Notes ──────────────────────────────────────────────────────────────

      addNote: (input) => {
        const ts = now();
        const id = newNoteId();
        const tagIds = input.tagIds ?? [];
        const collectionId = input.collectionId !== undefined
          ? input.collectionId
          : resolveNoteInheritedCollectionId(tagIds, get().noteTags);
        const note: Note = {
          id,
          title: input.title.trim(),
          content: input.content ?? '',
          abstract: null,
          tagIds,
          tagData: {},
          createdAt: ts,
          updatedAt: ts,
          lastViewedAt: null,
          archivedAt: null,
          color: input.color ?? null,
          pinned: false,
          parentId: null,
          tabs: [],
          mainTabName: 'Main',
          tabOrder: [],
          templateId: input.templateId ?? null,
          collectionId,
          isEncrypted: false,
          encryptedPayload: null,
          userId: '', // Will be set by sync service
        };
        set((state) => ({
          notes: { ...state.notes, [note.id]: note },
        }));
        return id;
      },

      updateNote: (id, changes) => editNote(id, (n) => ({ ...n, ...changes })),

      encryptNote: (id) => encryptNoteImpl(id),
      decryptNote: (id) => decryptNoteImpl(id),
      upgradeLegacyEncryptedNote: (id) => upgradeLegacyImpl(id),

      touchNote: (id) =>
        set((state) => {
          const note = state.notes[id];
          if (!note) return {};
          useRecentItemsStore.getState().recordVisit('note', id);
          return {
            notes: {
              ...state.notes,
              [id]: { ...note, lastViewedAt: now() },
            },
          };
        }),

      deleteNote: (id) =>
        set((state) => {
          const note = state.notes[id];
          if (note) moveToTrash('note', note);
          dropNoteSecrets(id);
          const notes = { ...state.notes };
          delete notes[id];
          // Orphaned children become top-level
          const orphaned = Object.fromEntries(
            Object.entries(state.notes)
              .filter(([, n]) => n.parentId === id)
              .map(([nid, n]) => [nid, { ...n, parentId: null }])
          ) as Record<NoteId, Note>;
          return { notes: { ...notes, ...orphaned } };
        }),

      indentNote: (id, newParentId) =>
        set((state) => {
          const note = state.notes[id];
          if (!note || note.id === newParentId) return {};
          return {
            notes: {
              ...state.notes,
              [id]: { ...note, parentId: newParentId, updatedAt: now() },
            },
          };
        }),

      outdentNote: (id) =>
        set((state) => {
          const note = state.notes[id];
          if (!note) return {};
          return {
            notes: {
              ...state.notes,
              [id]: { ...note, parentId: null, updatedAt: now() },
            },
          };
        }),

      addNoteTab: (noteId, name) => {
        const tabId = nanoid(8);
        editNote(noteId, (note) => {
          const tab: NoteTab = { id: tabId, name: name.trim() || 'Tab', content: '' };
          const currentOrder = (note.tabOrder ?? []).length
            ? note.tabOrder
            : ['__main__', ...note.tabs.map((t) => t.id)];
          return { ...note, tabs: [...note.tabs, tab], tabOrder: [...currentOrder, tabId] };
        });
        return tabId;
      },

      removeNoteTab: (noteId, tabId) =>
        editNote(noteId, (note) => ({
          ...note,
          tabs: note.tabs.filter((t) => t.id !== tabId),
          tabOrder: (note.tabOrder ?? []).filter((id) => id !== tabId),
        })),

      renameNoteTab: (noteId, tabId, name) =>
        editNote(noteId, (note) => ({
          ...note,
          tabs: note.tabs.map((t) => t.id === tabId ? { ...t, name: name.trim() || t.name } : t),
        })),

      updateNoteTabContent: (noteId, tabId, content) =>
        editNote(noteId, (note) => ({
          ...note,
          tabs: note.tabs.map((t) => t.id === tabId ? { ...t, content } : t),
        })),

      renameMainTab: (noteId, name) =>
        editNote(noteId, (note) => ({ ...note, mainTabName: name.trim() || 'Main' })),

      reorderNoteTabs: (noteId, newOrder) =>
        set((state) => {
          const note = state.notes[noteId];
          if (!note) return {};
          return {
            notes: {
              ...state.notes,
              [noteId]: { ...note, tabOrder: newOrder, updatedAt: now() },
            },
          };
        }),

      // ── Note Tags ──────────────────────────────────────────────────────────

      addNoteTag: (input): NoteTagId => {
        const ts = now();
        const id = newNoteTagId();
        const tag: NoteTag = {
          id,
          name: input.name.trim(),
          description: input.description,
          kind: input.kind ?? 'area',
          parentTagId: input.parentTagId ?? null,
          tagTypeId: input.tagTypeId ?? null,
          color: input.color ?? null,
          icon: input.icon ?? null,
          fieldSchema: input.fieldSchema ?? [],
          presetKey: input.presetKey,
          collectionId: input.collectionId ?? null,
          order: 0,
          createdAt: ts,
          updatedAt: ts,
          userId: '', // Will be set by sync service
        };
        set((state) => ({
          noteTags: {
            ...state.noteTags,
            [tag.id]: tag,
          },
        }));
        return id;
      },

      updateNoteTag: (id, changes) =>
        set((state) => {
          const tag = state.noteTags[id];
          if (!tag) return {};
          return {
            noteTags: {
              ...state.noteTags,
              [id]: { ...tag, ...changes, updatedAt: now() },
            },
          };
        }),

      deleteNoteTag: (id) =>
        set((state) => {
          const tag = state.noteTags[id];
          if (tag) moveToTrash('noteTag', tag);
          const noteTags = { ...state.noteTags };
          delete noteTags[id];
          // Remove tag from all notes
          const notes = Object.fromEntries(
            Object.entries(state.notes).map(([nid, note]) => [
              nid,
              { ...note, tagIds: note.tagIds.filter((t) => t !== id) },
            ])
          ) as Record<NoteId, Note>;
          // Orphaned children become root tags
          const orphanedChildren = Object.fromEntries(
            Object.entries(state.noteTags)
              .filter(([, tag]) => tag.parentTagId === id)
              .map(([tid, tag]) => [tid, { ...tag, parentTagId: null }])
          ) as Record<NoteTagId, NoteTag>;
          return {
            noteTags: { ...noteTags, ...orphanedChildren },
            notes,
          };
        }),

      indentNoteTag: (id) =>
        set((state) => {
          const tag = state.noteTags[id];
          if (!tag) return {};
          const siblings = Object.values(state.noteTags)
            .filter((t) => t.parentTagId === tag.parentTagId && t.kind === 'area')
            .sort((a, b) => a.order - b.order);
          const myPos = siblings.findIndex((t) => t.id === id);
          if (myPos <= 0) return {};
          const newParent = siblings[myPos - 1];
          return {
            noteTags: {
              ...state.noteTags,
              [id]: { ...tag, parentTagId: newParent.id as NoteTagId, order: 999, updatedAt: now() },
            },
          };
        }),

      outdentNoteTag: (id) =>
        set((state) => {
          const tag = state.noteTags[id];
          if (!tag || !tag.parentTagId) return {};
          const parent = state.noteTags[tag.parentTagId];
          if (!parent) return {};
          return {
            noteTags: {
              ...state.noteTags,
              [id]: { ...tag, parentTagId: parent.parentTagId, order: parent.order + 0.5, updatedAt: now() },
            },
          };
        }),

      // ── Structured tag entries ────────────────────────────────────────────

      addStructuredTagEntry: (input) => {
        const ts = now();
        const id = newStructuredTagEntryId();
        const entry: StructuredTagEntry = {
          id,
          typeKey:      input.typeKey,
          tagId:        input.tagId,
          term:         input.term,
          fields:       input.fields,
          noteId:       input.noteId,
          collectionId: input.collectionId,
          createdAt:    ts,
          updatedAt:    ts,
          isEncrypted:      false,
          encryptedPayload: null,
        };
        // An entry made from an encrypted note's text is born encrypted: its `term` is a
        // verbatim excerpt of that note, so a plaintext row would leak it.
        const host = get().notes[input.noteId];
        if (host?.isEncrypted && !isNoteLocked(host)) {
          const secrets = extractEntrySecrets(entry);
          putEntrySecrets(id, secrets, null, true);
          set((state) => ({
            structuredTagEntries: { ...state.structuredTagEntries, [id]: { ...blankEntrySecrets(entry), isEncrypted: true } },
          }));
          queueEncrypt(`entry:${id}`, secrets, (payload) => landEntryPayload(id, secrets, payload));
          return id;
        }
        set((state) => ({ structuredTagEntries: { ...state.structuredTagEntries, [id]: entry } }));
        return id;
      },

      updateStructuredTagEntry: (id, changes) => editEntry(id, (e) => ({ ...e, ...changes })),

      deleteStructuredTagEntry: (id) =>
        set((state) => {
          const entry = state.structuredTagEntries[id];
          if (entry) moveToTrash('structuredTagEntry', entry);
          dropEntrySecrets(id);
          const entries = { ...state.structuredTagEntries };
          delete entries[id];
          return { structuredTagEntries: entries };
        }),

      // ── Queries ────────────────────────────────────────────────────────────

      getNotesByTag: (tagId) => {
        const state = get();
        return Object.values(state.notes).filter((note) => note.tagIds.includes(tagId));
      },

      getChildTags: (parentTagId) => {
        const state = get();
        return Object.values(state.noteTags)
          .filter((tag) => tag.parentTagId === parentTagId)
          .sort((a, b) => a.order - b.order);
      },

      getRootTags: () => {
        const state = get();
        return Object.values(state.noteTags)
          .filter((tag) => tag.parentTagId === null)
          .sort((a, b) => a.order - b.order);
      },
    }),
    {
      name: 'notes-storage',
      storage: persistStorageIdb(),
      version: 12,
      migrate: (persisted: unknown, fromVersion: number) => {
        let state = persisted as NoteData;
        if (fromVersion < 2) {
          const noteTags = Object.fromEntries(
            Object.entries(state.noteTags ?? {}).map(([id, tag]) => [
              id,
              { kind: 'area', ...(tag as object) },
            ])
          ) as Record<NoteTagId, NoteTag>;
          state = { ...state, noteTags };
        }
        if (fromVersion < 3) {
          const noteTags = Object.fromEntries(
            Object.entries(state.noteTags ?? {}).map(([id, tag]) => [
              id,
              { fieldSchema: [] as NoteTagFieldDef[], ...(tag as object) },
            ])
          ) as Record<NoteTagId, NoteTag>;
          const notes = Object.fromEntries(
            Object.entries(state.notes ?? {}).map(([id, note]) => [
              id,
              { tagData: {}, ...(note as object) },
            ])
          ) as Record<NoteId, Note>;
          state = { ...state, noteTags, notes };
        }
        if (fromVersion < 4) {
          const notes = Object.fromEntries(
            Object.entries(state.notes ?? {}).map(([id, note]) => [
              id,
              { abstract: null, ...(note as object) },
            ])
          ) as Record<NoteId, Note>;
          state = { ...state, notes };
        }
        if (fromVersion < 5) {
          const notes = Object.fromEntries(
            Object.entries(state.notes ?? {}).map(([id, note]) => [
              id,
              { parentId: null, tabs: [], ...(note as object) },
            ])
          ) as unknown as Record<NoteId, Note>;
          state = { ...state, notes };
        }
        if (fromVersion < 6) {
          const notes = Object.fromEntries(
            Object.entries(state.notes ?? {}).map(([id, note]) => [
              id,
              { mainTabName: 'Main', ...(note as object) },
            ])
          ) as unknown as Record<NoteId, Note>;
          state = { ...state, notes };
        }
        if (fromVersion < 7) {
          const notes = Object.fromEntries(
            Object.entries(state.notes ?? {}).map(([id, note]) => {
              const n = note as unknown as Record<string, unknown>;
              return [id, { ...n, tabOrder: n['tabOrder'] ?? [] }];
            })
          ) as unknown as Record<NoteId, Note>;
          state = { ...state, notes };
        }
        if (fromVersion < 8) {
          const notes = Object.fromEntries(
            Object.entries(state.notes ?? {}).map(([id, note]) => [
              id,
              { templateId: null, ...(note as object) },
            ])
          ) as unknown as Record<NoteId, Note>;
          state = { ...state, notes };
        }
        if (fromVersion < 9) {
          const notes = Object.fromEntries(
            Object.entries(state.notes ?? {}).map(([id, note]) => [
              id,
              { collectionId: null, ...(note as object) },
            ])
          ) as unknown as Record<NoteId, Note>;
          const noteTags = Object.fromEntries(
            Object.entries(state.noteTags ?? {}).map(([id, tag]) => [
              id,
              { collectionId: null, ...(tag as object) },
            ])
          ) as unknown as Record<NoteTagId, NoteTag>;
          state = { ...state, notes, noteTags };
        }
        if (fromVersion < 10) {
          state = { ...state, structuredTagEntries: (state as { structuredTagEntries?: unknown }).structuredTagEntries ?? {} } as NoteData;
        }
        if (fromVersion < 11) {
          const notes = Object.fromEntries(
            Object.entries(state.notes ?? {}).map(([id, note]) => [
              id,
              { isEncrypted: false, ...(note as object) },
            ])
          ) as unknown as Record<NoteId, Note>;
          state = { ...state, notes };
        }
        if (fromVersion < 12) {
          const notes = Object.fromEntries(
            Object.entries(state.notes ?? {}).map(([id, note]) => [
              id,
              { encryptedPayload: null, ...(note as object) },
            ])
          ) as unknown as Record<NoteId, Note>;
          const structuredTagEntries = Object.fromEntries(
            Object.entries(state.structuredTagEntries ?? {}).map(([id, entry]) => [
              id,
              { isEncrypted: false, encryptedPayload: null, ...(entry as object) },
            ])
          ) as unknown as Record<StructuredTagEntryId, StructuredTagEntry>;
          state = { ...state, notes, structuredTagEntries };
        }
        return state;
      },
    }
  )
);

// ── Encryption-aware mutation helpers ────────────────────────────────────────
// Module-level (not inside the store creator) so the actions above can reference them lazily;
// they read/write through useNoteStore. See src/services/noteSecrets.ts for the model.

type NoteMap = Record<NoteId, Note>;
type EntryMap = Record<StructuredTagEntryId, StructuredTagEntry>;

const putNote = (id: NoteId, note: Note) =>
  useNoteStore.setState((s) => ({ notes: { ...s.notes, [id]: note } as NoteMap }));
const putEntry = (id: StructuredTagEntryId, entry: StructuredTagEntry) =>
  useNoteStore.setState((s) => ({ structuredTagEntries: { ...s.structuredTagEntries, [id]: entry } as EntryMap }));

const entriesOfNote = (noteId: NoteId) =>
  Object.values(useNoteStore.getState().structuredTagEntries).filter((e) => e.noteId === noteId);

// Apply `edit` — written against the READABLE (plaintext) form of a note — to note `id`. For a
// plain note that's a normal update. For an encrypted note the edit is applied to the cached
// plaintext immediately (the UI never waits on crypto) and re-encrypted in the background; an
// edit to a LOCKED encrypted note is refused rather than silently corrupting it.
function editNote(id: NoteId, edit: (n: Note) => Note): void {
  const raw = useNoteStore.getState().notes[id];
  if (!raw) return;
  if (!raw.isEncrypted) {
    putNote(id, { ...edit(raw), updatedAt: now() });
    return;
  }
  if (isNoteLocked(raw)) {
    console.warn('[noteStore] ignored an edit to a locked encrypted note:', id);
    return;
  }
  const edited = edit(noteView(raw));
  const secrets = extractNoteSecrets(edited);
  putNoteSecrets(id, secrets, raw.encryptedPayload, true);
  putNote(id, { ...blankNoteSecrets(edited), isEncrypted: true, encryptedPayload: raw.encryptedPayload, updatedAt: now() });
  queueEncrypt(`note:${id}`, secrets, (payload) => landNotePayload(id, secrets, payload));
}

// Store first, cache second: the cache entry is `dirty` (trusted regardless of payload) until
// the second step, so this order never shows a "locked" flash between the two writes.
function landNotePayload(id: NoteId, secrets: NoteSecrets, payload: string): void {
  const cur = useNoteStore.getState().notes[id];
  if (!cur || !cur.isEncrypted) return; // deleted or decrypted while this was encrypting
  putNote(id, { ...cur, encryptedPayload: payload });
  putNoteSecrets(id, secrets, payload, false);
}

function editEntry(id: StructuredTagEntryId, edit: (e: StructuredTagEntry) => StructuredTagEntry): void {
  const raw = useNoteStore.getState().structuredTagEntries[id];
  if (!raw) return;
  if (!raw.isEncrypted) {
    putEntry(id, { ...edit(raw), updatedAt: now() });
    return;
  }
  if (isEntryLocked(raw)) {
    console.warn('[noteStore] ignored an edit to a locked encrypted entry:', id);
    return;
  }
  const edited = edit(entryView(raw));
  const secrets = extractEntrySecrets(edited);
  putEntrySecrets(id, secrets, raw.encryptedPayload, true);
  putEntry(id, { ...blankEntrySecrets(edited), isEncrypted: true, encryptedPayload: raw.encryptedPayload, updatedAt: now() });
  queueEncrypt(`entry:${id}`, secrets, (payload) => landEntryPayload(id, secrets, payload));
}

function landEntryPayload(id: StructuredTagEntryId, secrets: EntrySecrets, payload: string): void {
  const cur = useNoteStore.getState().structuredTagEntries[id];
  if (!cur || !cur.isEncrypted) return;
  putEntry(id, { ...cur, encryptedPayload: payload });
  putEntrySecrets(id, secrets, payload, false);
}

async function encryptEntryImpl(id: StructuredTagEntryId): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = useNoteStore.getState().structuredTagEntries[id];
    if (!raw || raw.isEncrypted) return;
    const secrets = extractEntrySecrets(raw);
    const payload = await encryptSecrets(secrets);
    if (useNoteStore.getState().structuredTagEntries[id] !== raw) continue; // edited mid-encrypt — redo on the fresh text
    putEntry(id, { ...blankEntrySecrets(raw), isEncrypted: true, encryptedPayload: payload, updatedAt: now() });
    putEntrySecrets(id, secrets, payload, false);
    return;
  }
  throw new Error('An entry kept changing while it was being encrypted; try again.');
}

async function decryptEntryImpl(id: StructuredTagEntryId): Promise<void> {
  const raw = useNoteStore.getState().structuredTagEntries[id];
  if (!raw || !raw.isEncrypted) return;
  // Don't rely on the cache being warm: it's filled asynchronously after unlock.
  const secrets = isEntryLocked(raw)
    ? (raw.encryptedPayload ? await decryptSecrets<EntrySecrets>(raw.encryptedPayload) : null)
    : extractEntrySecrets(entryView(raw));
  if (!secrets) throw new Error('Could not read this entry\u2019s encrypted contents.');
  putEntry(id, { ...raw, term: secrets.term, fields: secrets.fields, isEncrypted: false, encryptedPayload: null, updatedAt: now() });
  dropEntrySecrets(id);
}

async function encryptNoteImpl(id: NoteId): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = useNoteStore.getState().notes[id];
    if (!raw || raw.isEncrypted) return;
    const secrets = extractNoteSecrets(raw);
    const payload = await encryptSecrets(secrets); // rejects "Vault is locked" if it is
    if (useNoteStore.getState().notes[id] !== raw) continue; // edited mid-encrypt — redo on the fresh text
    putNote(id, { ...blankNoteSecrets(raw), isEncrypted: true, encryptedPayload: payload, updatedAt: now() });
    putNoteSecrets(id, secrets, payload, false);
    // Entries hold verbatim excerpts of this note's text — they must follow it.
    await Promise.all(entriesOfNote(id).map((e) => encryptEntryImpl(e.id)));
    return;
  }
  throw new Error('This note kept changing while it was being encrypted; try again.');
}

async function decryptNoteImpl(id: NoteId): Promise<void> {
  const raw = useNoteStore.getState().notes[id];
  if (!raw || !raw.isEncrypted) return;
  // Don't rely on the cache being warm: it's filled asynchronously after unlock, and the
  // decrypt-with-password prompt unlocks the vault and decrypts in one go.
  const secrets = isNoteLocked(raw)
    ? (raw.encryptedPayload ? await decryptSecrets<NoteSecrets>(raw.encryptedPayload) : null)
    : extractNoteSecrets(noteView(raw));
  if (!secrets) throw new Error('Unlock encryption first \u2014 this note\u2019s contents aren\u2019t available.');
  putNote(id, { ...applyNoteSecrets(raw, secrets), isEncrypted: false, encryptedPayload: null, updatedAt: now() });
  dropNoteSecrets(id);
  await Promise.all(entriesOfNote(id).map((e) => decryptEntryImpl(e.id)));
}

// Notes encrypted by the first version of this feature kept title/abstract/tabs in plaintext and
// stored only `content` as an envelope, with no encryptedPayload. Once the vault is unlocked,
// fold them into the new all-fields payload (called from noteSecretsSync). Failures are
// remembered so a permanently-unreadable legacy note isn't retried on every store change.
const upgrading = new Set<string>();
const upgradeFailed = new Set<string>();
async function upgradeLegacyImpl(id: NoteId): Promise<void> {
  const raw = useNoteStore.getState().notes[id];
  if (!raw || !raw.isEncrypted || raw.encryptedPayload) return;
  if (upgrading.has(id) || upgradeFailed.has(id)) return;
  upgrading.add(id);
  try {
    const content = await decryptField(raw.content);
    const secrets = extractNoteSecrets({ ...raw, content });
    const payload = await encryptSecrets(secrets);
    if (useNoteStore.getState().notes[id] !== raw) return; // changed mid-upgrade — retried on the next store change
    putNote(id, { ...blankNoteSecrets(raw), isEncrypted: true, encryptedPayload: payload, updatedAt: now() });
    putNoteSecrets(id, secrets, payload, false);
    await Promise.all(entriesOfNote(id).map((e) => encryptEntryImpl(e.id)));
  } catch (err) {
    upgradeFailed.add(id);
    console.error('[noteStore] could not upgrade legacy encrypted note', id, err);
  } finally {
    upgrading.delete(id);
  }
}
