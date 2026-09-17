import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { Note, NoteTab, NoteTag, NoteId, NoteTagId, CreateNoteInput, CreateNoteTagInput, NoteTagFieldDef, StructuredTagEntry, StructuredTagEntryId, CollectionId } from '@/types';
import { newNoteId, newNoteTagId, newStructuredTagEntryId } from '@/utils/id';
import { now } from '@/utils/date';
import { resolveNoteInheritedCollectionId } from '@/utils/notes';
import { useRecentItemsStore } from '@/store/recentItemsStore';

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
          userId: '', // Will be set by sync service
        };
        set((state) => ({
          notes: { ...state.notes, [note.id]: note },
        }));
        return id;
      },

      updateNote: (id, changes) =>
        set((state) => {
          const note = state.notes[id];
          if (!note) return {};
          return {
            notes: {
              ...state.notes,
              [id]: { ...note, ...changes, updatedAt: now() },
            },
          };
        }),

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
        set((state) => {
          const note = state.notes[noteId];
          if (!note) return {};
          const tab: NoteTab = { id: tabId, name: name.trim() || 'Tab', content: '' };
          const currentOrder = (note.tabOrder ?? []).length
            ? note.tabOrder
            : ['__main__', ...note.tabs.map((t) => t.id)];
          return {
            notes: {
              ...state.notes,
              [noteId]: { ...note, tabs: [...note.tabs, tab], tabOrder: [...currentOrder, tabId], updatedAt: now() },
            },
          };
        });
        return tabId;
      },

      removeNoteTab: (noteId, tabId) =>
        set((state) => {
          const note = state.notes[noteId];
          if (!note) return {};
          return {
            notes: {
              ...state.notes,
              [noteId]: {
                ...note,
                tabs: note.tabs.filter((t) => t.id !== tabId),
                tabOrder: (note.tabOrder ?? []).filter((id) => id !== tabId),
                updatedAt: now(),
              },
            },
          };
        }),

      renameNoteTab: (noteId, tabId, name) =>
        set((state) => {
          const note = state.notes[noteId];
          if (!note) return {};
          return {
            notes: {
              ...state.notes,
              [noteId]: {
                ...note,
                tabs: note.tabs.map((t) => t.id === tabId ? { ...t, name: name.trim() || t.name } : t),
                updatedAt: now(),
              },
            },
          };
        }),

      updateNoteTabContent: (noteId, tabId, content) =>
        set((state) => {
          const note = state.notes[noteId];
          if (!note) return {};
          return {
            notes: {
              ...state.notes,
              [noteId]: {
                ...note,
                tabs: note.tabs.map((t) => t.id === tabId ? { ...t, content } : t),
                updatedAt: now(),
              },
            },
          };
        }),

      renameMainTab: (noteId, name) =>
        set((state) => {
          const note = state.notes[noteId];
          if (!note) return {};
          return {
            notes: {
              ...state.notes,
              [noteId]: { ...note, mainTabName: name.trim() || 'Main', updatedAt: now() },
            },
          };
        }),

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
        };
        set((state) => ({ structuredTagEntries: { ...state.structuredTagEntries, [id]: entry } }));
        return id;
      },

      updateStructuredTagEntry: (id, changes) =>
        set((state) => {
          const entry = state.structuredTagEntries[id];
          if (!entry) return {};
          return {
            structuredTagEntries: {
              ...state.structuredTagEntries,
              [id]: { ...entry, ...changes, updatedAt: now() },
            },
          };
        }),

      deleteStructuredTagEntry: (id) =>
        set((state) => {
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
      version: 10,
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
        return state;
      },
    }
  )
);
