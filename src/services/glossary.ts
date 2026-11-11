import { useNoteStore } from '@/store/noteStore';
import { iconText } from '@/components/IconPicker/iconValue';
import { LABELS } from '@/config/labels';
import { importanceLevel } from '@/components/NoteEditor/extensions/importanceLevels';
import { entryView, isEntryLocked, noteView } from '@/services/noteSecrets';
import { BUILTIN_TAGS } from '@/components/NoteEditor/builtinTags';
import { GLOSSARY_TYPES, HEADLINED_KINDS, OUTSIDE_GLOSSARY, glossaryKinds, glossaryMeaning, glossaryNames } from '@/config/structuredTagTypes';
import { countConceptRefs } from '@/utils/noteContent';
import { getNoteNotebookPath } from '@/utils/notes';
import { useTrashStore } from '@/store/trashStore';
import { changeKind } from '@/utils/glossaryKindChange';
import { showToast } from '@/components/Toast/showToast';
import type { NoteTag } from '@/types/notes';
import type { Note, StructuredTagEntry } from '@/types/notes';
import type { NoteId, StructuredTagEntryId } from '@/types';

// The Glossary: every Definition, Concept, Acronym, Profile and Fact record (StructuredTagEntry,
// config/structuredTagTypes.ts GLOSSARY_TYPES), with where it came from and how often other text
// refers to it (conceptRef marks). Read through the views, so an encrypted note's entries show while
// the vault is unlocked and as locked otherwise. Pure reads over the stores; nothing is cached.
//
// A record lives in the Glossary, not in a note (agreed with the user 2026-11-03): taking its card
// out of a note, or deleting the note, asks whether to delete it too (services/glossaryOrphans.ts),
// and keeping it leaves it here with the note it came from remembered (`origin`).

export interface GlossaryEntry {
  id:        string;
  typeKey:   string;
  term:      string;
  meaning:   string;
  icon:      string;
  color:     string;
  kindLabel: string;
  noteId:    string | null;   // the note it came from; null when made in the Glossary
  noteTitle: string;
  // Where it came from: a note there now, a note in the Recycling Bin (its title as it was then),
  // a note deleted for good, or the Glossary itself.
  origin:    'note' | 'trashed' | 'deleted' | 'glossary';
  notebookPath: string[];   // root notebook → the note's notebook; [] when it's in none
  locked:    boolean;
  importance: 0 | 1 | 2 | 3;
  short:     string | null;   // its acronym, whichever way it was made (glossaryNames)
  long:      string | null;   // what that stands for
  kinds:     string[];        // its own kind first, then any it also counts as (glossaryKinds)
  updatedAt: string;
}

const tagFor = (typeKey: string) => BUILTIN_TAGS.find((t) => t.typeKey === typeKey);

export function toGlossaryEntry(raw: StructuredTagEntry, notes: Record<NoteId, Note>, noteTags: Record<string, NoteTag> = {}): GlossaryEntry | null {
  if (!(raw.typeKey in GLOSSARY_TYPES)) return null;
  const e = entryView(raw);
  const tag = tagFor(e.typeKey);
  const note = e.noteId ? notes[e.noteId] : undefined;
  const trashed = e.noteId && !note ? trashedNoteTitle(e.noteId) : null;
  return {
    id: e.id, typeKey: e.typeKey, term: e.term, meaning: glossaryMeaning(e),
    icon: iconText(tag?.icon, '📖'), color: tag?.color ?? '#10b981', kindLabel: tag?.name ?? e.typeKey,
    noteId: e.noteId, noteTitle: note ? noteView(note).title : trashed ?? '',
    origin: !e.noteId ? 'glossary' : note ? 'note' : trashed !== null ? 'trashed' : 'deleted',
    notebookPath: note ? getNoteNotebookPath(noteView(note), noteTags) : [],
    locked: isEntryLocked(raw), importance: entryImportance(e), ...glossaryNames(e), kinds: glossaryKinds(e), updatedAt: e.updatedAt,
  };
}

// The title of a note in the Recycling Bin (as it was when deleted), or null if it isn't there.
function trashedNoteTitle(noteId: string): string | null {
  for (const t of Object.values(useTrashStore.getState().entries)) {
    if (t.kind === 'note' && (t.snapshot as { id?: string } | null)?.id === noteId) return t.title;
  }
  return null;
}

// The Recycling Bin entry of the note a record came from, to restore it from where it's named.
export function trashedOriginOf(noteId: string) {
  return Object.values(useTrashStore.getState().entries).find((t) => t.kind === 'note' && (t.snapshot as { id?: string } | null)?.id === noteId) ?? null;
}

// How important a record is (asked for by the user 2026-10-26): 0, or the Important levels 1–3
// ("Key concept", "Very important concept", "Critical concept"). On the record, not its card, so
// the Glossary, hover cards and every card of it agree; in its fields (so it syncs and encrypts
// with it).
export const IMPORTANCE_FIELD = 'importance';
export const entryImportance = (e: Pick<StructuredTagEntry, 'fields'>): 0 | 1 | 2 | 3 => {
  const v = e.fields?.[IMPORTANCE_FIELD];
  return v === 1 || v === 2 || v === 3 ? v : 0;
};

// How a record's kind reads wherever it's listed: its importance (Key concept…) and the kinds it
// also counts as ("Definition · also an acronym").
export function glossaryKindLine(e: Pick<GlossaryEntry, 'kindLabel' | 'importance' | 'kinds'>): string {
  const base = e.importance ? `${importanceLevel(e.importance).icon} ${LABELS.importance.kindLevel(e.importance, e.kindLabel)}` : e.kindLabel;
  const also = e.kinds.slice(1).map((k) => LABELS.glossary.kindNames[k as keyof typeof LABELS.glossary.kindNames] ?? k);
  return also.length ? `${base} · ${LABELS.glossary.alsoKinds(also)}` : base;
}

// Changes a record's kind (a Concept into a Definition: utils/glossaryKindChange.ts says what moves
// where), with Undo in the toast. Every card and chip of it then shows the new kind. Not while locked.
export function changeGlossaryKind(id: string, toKey: string): boolean {
  const store = useNoteStore.getState();
  const raw = store.structuredTagEntries[id as StructuredTagEntryId];
  const tag = BUILTIN_TAGS.find((t) => t.typeKey === toKey);
  if (!raw || isEntryLocked(raw) || !tag) return false;
  const view = entryView(raw);
  const next = changeKind(view, toKey);
  if (!next) return false;
  const before = { typeKey: view.typeKey, tagId: view.tagId, term: view.term, fields: view.fields };
  store.updateStructuredTagEntry(raw.id, { ...next, tagId: tag.id as StructuredTagEntry['tagId'] });
  const L = LABELS.glossaryCard;
  showToast({
    message: L.kindChanged(next.term || L.untitledTerm, tag.name),
    actions: [{ label: L.undoKind, onClick: () => useNoteStore.getState().updateStructuredTagEntry(raw.id, before) }],
  });
  return true;
}

export function setEntryImportance(id: string, level: 0 | 1 | 2 | 3): void {
  const store = useNoteStore.getState();
  const raw = store.structuredTagEntries[id as StructuredTagEntryId];
  if (!raw || isEntryLocked(raw)) return;
  const fields = { ...entryView(raw).fields };
  if (level) fields[IMPORTANCE_FIELD] = level; else delete fields[IMPORTANCE_FIELD];
  store.updateStructuredTagEntry(raw.id, { fields });
}

export function glossaryEntries(): GlossaryEntry[] {
  const { structuredTagEntries, notes, noteTags } = useNoteStore.getState();
  return Object.values(structuredTagEntries)
    .map((e) => toGlossaryEntry(e, notes, noteTags))
    // A card's record has no term until one is typed (`\definition`); it isn't listed until then.
    .filter((e): e is GlossaryEntry => !!e && (e.locked || e.term.trim() !== ''))
    // A quote is kept in Quotes, not the Glossary (OUTSIDE_GLOSSARY): read one with glossaryEntry.
    .filter((e) => !OUTSIDE_GLOSSARY.has(e.typeKey))
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
}

// The terms a Fact's or Quote's headline may be built from (utils/factHeadline.ts): every readable
// record's term but the headlined kinds' own, and but `except` (the record being named).
export function headlineTerms(except?: string): string[] {
  return glossaryEntries().filter((e) => e.id !== except && !e.locked && !HEADLINED_KINDS.has(e.typeKey)).map((e) => e.term);
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

// The Glossary's kind filter: a kind's pill turned on or off. Every kind on is the same as All, so it becomes All.
export function toggleGlossaryKind(picked: ReadonlySet<string>, kind: string, shown: ReadonlyMap<string, string>): Set<string> {
  const next = new Set(picked);
  if (next.has(kind)) next.delete(kind); else next.add(kind);
  return [...shown.keys()].every((k) => next.has(k)) ? new Set() : next;
}
