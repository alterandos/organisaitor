import { useMemo } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { noteView, entryView, useSecretsVersion } from '@/services/noteSecrets';
import type { Note, NoteId, StructuredTagEntry, StructuredTagEntryId } from '@/types';

// React-side of the "read a note through noteView()" rule (see services/noteSecrets.ts): these
// return notes/entries with encrypted ones resolved from the plaintext cache (or a locked
// placeholder), and re-derive whenever the store OR the cache changes. Use these instead of
// `useNoteStore((s) => s.notes)` anywhere a note's title/content/abstract/tabs/tagData is read.

export function useNoteViews(): Record<NoteId, Note> {
  const notes = useNoteStore((s) => s.notes);
  const version = useSecretsVersion((s) => s.version);
  return useMemo(() => {
    void version; // re-derive when the plaintext cache changes, not just the store
    const out = {} as Record<NoteId, Note>;
    for (const [id, n] of Object.entries(notes)) out[id as NoteId] = noteView(n);
    return out;
  }, [notes, version]);
}

export function useNoteView(id: string | null | undefined): Note | null {
  const raw = useNoteStore((s) => (id ? s.notes[id as NoteId] : undefined));
  const version = useSecretsVersion((s) => s.version);
  return useMemo(() => {
    void version;
    return raw ? noteView(raw) : null;
  }, [raw, version]);
}

export function useEntryViews(): Record<StructuredTagEntryId, StructuredTagEntry> {
  const entries = useNoteStore((s) => s.structuredTagEntries);
  const version = useSecretsVersion((s) => s.version);
  return useMemo(() => {
    void version;
    const out = {} as Record<StructuredTagEntryId, StructuredTagEntry>;
    for (const [id, e] of Object.entries(entries)) out[id as StructuredTagEntryId] = entryView(e);
    return out;
  }, [entries, version]);
}
