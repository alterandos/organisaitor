import { useNoteStore } from '@/store/noteStore';
import { iconText } from '@/components/IconPicker/iconValue';
import { entryView, isEntryLocked, isNoteLocked, noteView } from '@/services/noteSecrets';
import { BUILTIN_TAGS } from '@/components/NoteEditor/builtinTags';
import { GLOSSARY_TYPES, glossaryMeaning } from '@/config/structuredTagTypes';
import { countConceptRefs } from '@/utils/noteContent';
import { getNoteNotebookPath } from '@/utils/notes';
import { liveNotes } from '@/services/liveNoteEditor';
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
    icon: iconText(tag?.icon, '📖'), color: tag?.color ?? '#10b981', kindLabel: tag?.name ?? e.typeKey,
    noteId: e.noteId, noteTitle: note ? noteView(note).title : '',
    notebookPath: note ? getNoteNotebookPath(noteView(note), noteTags) : [],
    locked: isEntryLocked(raw), updatedAt: e.updatedAt,
  };
}

// The records whose note still holds their card or marked text. One whose definition was deleted
// before deleting it took the record along (2026-10-13) is left out of the Glossary, of linking as
// you type and of Quick Access. The open note is read live (its latest typing may not be saved
// yet); a locked note can't be read, so its records count as there.
function stillDefined(entries: StructuredTagEntry[], notes: Record<NoteId, Note>): Set<string> {
  const out = new Set<string>();
  const live = liveNotes();
  const inLive = new Set<string>();
  for (const l of live) l.view.state.doc.descendants((n) => {
    if ((n.type.name === 'glossaryCard' || n.type.name === 'glossaryChip') && n.attrs.entryId) inLive.add(n.attrs.entryId as string);
    if (n.isText) for (const m of n.marks) if (m.type.name === 'noteTag' && m.attrs.structuredEntryId) inLive.add(m.attrs.structuredEntryId as string);
    return true;
  });
  for (const e of entries) {
    const raw = notes[e.noteId];
    if (!raw) continue;
    if (live.some((l) => l.noteId === e.noteId) && inLive.has(e.id)) { out.add(e.id); continue; }
    if (isNoteLocked(raw)) { out.add(e.id); continue; }
    const n = noteView(raw);
    if ([n.content, ...n.tabs.map((t) => t.content)].some((c) => c?.includes(e.id))) out.add(e.id);
  }
  return out;
}

export function glossaryEntries(): GlossaryEntry[] {
  const { structuredTagEntries, notes, noteTags } = useNoteStore.getState();
  const defined = stillDefined(Object.values(structuredTagEntries), notes);
  return Object.values(structuredTagEntries)
    .filter((e) => defined.has(e.id))
    .map((e) => toGlossaryEntry(e, notes, noteTags))
    // A card's record has no term until one is typed (`\definition`); it isn't listed until then.
    .filter((e): e is GlossaryEntry => !!e && (e.locked || e.term.trim() !== ''))
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
