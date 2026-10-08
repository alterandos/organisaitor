import { useNoteStore } from '@/store/noteStore';
import { entryView, isEntryLocked, noteView } from '@/services/noteSecrets';
import { BUILTIN_TAGS } from '@/components/NoteEditor/builtinTags';
import { GLOSSARY_TYPES, glossaryMeaning } from '@/config/structuredTagTypes';
import { countConceptRefs } from '@/utils/noteContent';
import { getNoteNotebookPath } from '@/utils/notes';
import type { NoteTag } from '@/types/notes';
import type { Note, StructuredTagEntry } from '@/types/notes';
import type { NoteId, StructuredTagEntryId } from '@/types';

// The Glossary: every Definition, Concept and Acronym record (StructuredTagEntry, config/
// structuredTagTypes.ts GLOSSARY_TYPES), with where it's defined and how often other text refers
// to it (conceptRef marks). Read through the views, so an encrypted note's entries show while the
// vault is unlocked and as locked otherwise. Pure reads over the stores; nothing is cached.

export interface GlossaryEntry {
  id:        string;
  typeKey:   string;
  term:      string;
  meaning:   string;
  icon:      string;
  color:     string;
  kindLabel: string;
  noteId:    string;
  noteTitle: string;
  notebookPath: string[];   // root notebook → the note's notebook; [] when it's in none
  locked:    boolean;
  updatedAt: string;
}

const tagFor = (typeKey: string) => BUILTIN_TAGS.find((t) => t.typeKey === typeKey);

export function toGlossaryEntry(raw: StructuredTagEntry, notes: Record<NoteId, Note>, noteTags: Record<string, NoteTag> = {}): GlossaryEntry | null {
  if (!(raw.typeKey in GLOSSARY_TYPES)) return null;
  const e = entryView(raw);
  const tag = tagFor(e.typeKey);
  const note = notes[e.noteId];
  return {
    id: e.id, typeKey: e.typeKey, term: e.term, meaning: glossaryMeaning(e),
    icon: tag?.icon ?? '📖', color: tag?.color ?? '#10b981', kindLabel: tag?.name ?? e.typeKey,
    noteId: e.noteId, noteTitle: note ? noteView(note).title : '',
    notebookPath: note ? getNoteNotebookPath(noteView(note), noteTags) : [],
    locked: isEntryLocked(raw), updatedAt: e.updatedAt,
  };
}

export function glossaryEntries(): GlossaryEntry[] {
  const { structuredTagEntries, notes, noteTags } = useNoteStore.getState();
  return Object.values(structuredTagEntries)
    .map((e) => toGlossaryEntry(e, notes, noteTags))
    .filter((e): e is GlossaryEntry => !!e)
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
}

export function glossaryEntry(id: string): GlossaryEntry | null {
  const { structuredTagEntries, notes, noteTags } = useNoteStore.getState();
  const raw = structuredTagEntries[id as StructuredTagEntryId];
  return raw ? toGlossaryEntry(raw, notes, noteTags) : null;
}

// Per entry id: the notes whose text refers to it, with how many passages each.
export function glossaryReferences(): Map<string, { noteId: string; count: number }[]> {
  const out = new Map<string, { noteId: string; count: number }[]>();
  for (const raw of Object.values(useNoteStore.getState().notes)) {
    const note = noteView(raw);
    const counts = new Map<string, number>();
    countConceptRefs(note.content, counts);
    for (const tab of note.tabs) countConceptRefs(tab.content, counts);
    for (const [entryId, count] of counts) {
      const list = out.get(entryId) ?? [];
      list.push({ noteId: note.id, count });
      out.set(entryId, list);
    }
  }
  return out;
}
