import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { glossaryEntry, headlineTerms, type GlossaryEntry } from '@/services/glossary';
import { GLOSSARY_TYPES } from '@/config/structuredTagTypes';
import { factHeadline, quoteHeadline, splitQuote } from '@/utils/factHeadline';
import { BUILTIN_TAGS } from '@/components/NoteEditor/builtinTags';
import { deleteForever, trashedBy } from '@/services/trash';
import type { List, ListId, ListItemId } from '@/types/lists';
import type { NoteId } from '@/types';

// Glossary lists (agreed with the user 2026-11-03): a list in Lists whose rows are Glossary records
// of one kind (its type's `glossaryKind`: the Facts list holds Facts). A record is put in a list on
// purpose (sent there, or made there), never because of its kind: a fact defined in a note isn't in
// a list unless sent. Each row is a list item holding only the record's id, so the record stays the
// one copy: editing a row edits the record, and a record deleted from the Glossary drops out of the
// list (its item is left, harmless, and the row comes back if the record is restored).

export const GLOSSARY_ENTRY_FIELD = 'lf-entry';

export function glossaryKindOf(list: Pick<List, 'typeId'> | null | undefined): string | null {
  if (!list?.typeId) return null;
  return useListStore.getState().listTypes[list.typeId]?.glossaryKind ?? null;
}

export interface GlossaryListRow { itemId: ListItemId; entry: GlossaryEntry }

const entryIdOf = (data: Record<string, unknown>) => (typeof data[GLOSSARY_ENTRY_FIELD] === 'string' ? (data[GLOSSARY_ENTRY_FIELD] as string) : null);

// The list's records, in the list's order (newest first among equals).
export function glossaryListRows(listId: string): GlossaryListRow[] {
  return Object.values(useListStore.getState().listItems)
    .filter((i) => i.listId === listId)
    .sort((a, b) => a.order - b.order || b.createdAt.localeCompare(a.createdAt))
    .map((i) => {
      const id = entryIdOf(i.data);
      const entry = id ? glossaryEntry(id) : null;
      return entry ? { itemId: i.id, entry } : null;
    })
    .filter((r): r is GlossaryListRow => !!r);
}

export function listHasEntry(listId: string, entryId: string): boolean {
  return Object.values(useListStore.getState().listItems).some((i) => i.listId === listId && entryIdOf(i.data) === entryId);
}

// Puts a record in the list (once). Returns its row's item.
export function addEntryToList(listId: ListId, entryId: string): ListItemId {
  const have = Object.values(useListStore.getState().listItems).find((i) => i.listId === listId && entryIdOf(i.data) === entryId);
  if (have) return have.id;
  return useListStore.getState().addListItem({ listId, title: '', data: { [GLOSSARY_ENTRY_FIELD]: entryId } });
}

// Takes a record out of the list; it stays in the Glossary.
export function removeEntryFromList(itemId: ListItemId): void {
  useListStore.getState().deleteListItem(itemId);
}

// A new record of the list's kind from some text (Send to ▸ A list…), put in the list: the text is
// its main field, a headline worked out for a Fact; `noteId` the note it came from. Returns its id.
export function recordIntoList(listId: ListId, text: string, details: string, noteId: string | null): string | null {
  const kind = glossaryKindOf(useListStore.getState().lists[listId]);
  const tag = BUILTIN_TAGS.find((t) => t.typeKey === kind);
  if (!kind || !tag || !text.trim()) return null;
  const quote = kind === 'quote' ? splitQuote(text) : null;
  const fields: Record<string, unknown> = { [GLOSSARY_TYPES[kind] ?? 'meaning']: quote ? quote.text : text.trim() };
  if (quote?.who) fields.who = quote.who;
  if (details.trim()) fields[kind === 'fact' ? 'details' : kind === 'quote' ? 'source' : 'explanation'] = details.trim();
  const term = kind === 'fact' ? factHeadline(text, { terms: headlineTerms() }) : quote ? quoteHeadline(quote.text, quote.who) : text.trim();
  const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: kind, tagId: tag.id, term, fields, noteId: noteId as NoteId | null, collectionId: null });
  addEntryToList(listId, id);
  return id;
}

// A record made in a list and left empty (GlossaryRecordModal) goes from every list, for good.
export function forgetEntryInLists(entryId: string): void {
  for (const i of Object.values(useListStore.getState().listItems)) {
    if (entryIdOf(i.data) !== entryId) continue;
    for (const t of trashedBy(() => useListStore.getState().deleteListItem(i.id))) deleteForever(t);
  }
}

// A new record of the list's kind, made in the Glossary and put in the list, opened to write in.
export function newRecordInList(listId: ListId): string | null {
  const kind = glossaryKindOf(useListStore.getState().lists[listId]);
  const tag = BUILTIN_TAGS.find((t) => t.typeKey === kind);
  if (!kind || !tag) return null;
  const id = useNoteStore.getState().addStructuredTagEntry({ typeKey: kind, tagId: tag.id, term: '', fields: {}, noteId: null as NoteId | null, collectionId: null });
  addEntryToList(listId, id);
  useUIStore.getState().openGlossaryRecord(id, { fresh: true });
  return id;
}
