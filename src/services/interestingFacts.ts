import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { entryView, isEntryLocked, isNoteLocked, noteView } from '@/services/noteSecrets';
import { builtInList, ensureBuiltInList, type BuiltInListSpec } from '@/services/builtInLists';
import { addEntryToList, glossaryListRows, removeEntryFromList } from '@/services/glossaryLists';
import { headlineTerms } from '@/services/glossary';
import { deleteForever, trashedBy } from '@/services/trash';
import { showToast } from '@/components/Toast/showToast';
import { fieldText } from '@/config/structuredTagTypes';
import { factHeadline } from '@/utils/factHeadline';
import { LABELS } from '@/config/labels';
import type { List, ListTypeId } from '@/types/lists';
import type { NoteId, StructuredTagEntryId } from '@/types';

// Interesting facts (asked for by the user 2026-11-02; reworked 2026-11-03): facts worth keeping.
// Each is a Fact in the Glossary (a record, config/structuredTagTypes.ts), and the Interesting facts
// list in Lists is a Glossary list of them (services/glossaryLists.ts): the list is built from the
// records, so there's one copy of each fact. Kept from the Today card ("Keep in Interesting facts")
// or sent from a note ("Add to interesting facts" on selected text). A fact defined in a note with
// `\fact` isn't in the list unless sent there.

export const FACTS_TYPE_ID = 'lt-facts' as ListTypeId;
const L = LABELS.interestingFacts;

// A built-in list fed from elsewhere (services/builtInLists.ts).
const FACTS: BuiltInListSpec = { typeId: FACTS_TYPE_ID, name: L.listName };

export interface NewFact {
  statement: string;
  title?:    string | null;    // its headline, if it came with one (a Wikipedia article's title)
  details?:  string;
  url?:      string | null;
  source?:   string;
  noteId?:   string | null;    // the note it came from, if any (its origin in the Glossary)
}

// The Interesting facts list, if there is one; a locked one is treated as absent.
export const factsList = (): List | null => builtInList(FACTS);

const clean = (text: string) => text.trim().replace(/\s+/g, ' ');

// The fact in the list with this statement, if there is one (the Today card shows "Kept").
function factInList(listId: string, statement: string) {
  const want = clean(statement).toLowerCase();
  return glossaryListRows(listId).find((r) => {
    const raw = useNoteStore.getState().structuredTagEntries[r.entry.id as StructuredTagEntryId];
    return raw && !isEntryLocked(raw) && clean(fieldText(entryView(raw).fields, 'statement')).toLowerCase() === want;
  }) ?? null;
}

export function hasFact(statement: string): boolean {
  const list = factsList();
  return !!list && !!factInList(list.id, statement);
}

// Makes a Fact record and puts it in the list (or finds the one already there), and says so, with
// Open and, while it's new, Undo (which takes the record away for good).
export function addInterestingFact(fact: NewFact): string | null {
  const statement = clean(fact.statement);
  if (!statement) return null;
  const listId = ensureBuiltInList(FACTS);
  const open = { label: L.open, onClick: () => { useUIStore.getState().setActiveView('lists'); useUIStore.getState().setActiveListId(listId); } };
  const already = factInList(listId, statement);
  if (already) { showToast({ message: L.already, actions: [open] }); return already.entry.id; }
  const fields: Record<string, unknown> = { statement };
  if (fact.details?.trim()) fields.details = fact.details.trim();
  if (fact.source?.trim()) fields.source = fact.source.trim();
  if (fact.url) fields.weblinks = [fact.url];
  const entryId = useNoteStore.getState().addStructuredTagEntry({
    typeKey: 'fact', tagId: 'builtin-fact', term: factHeadline(statement, { title: fact.title, terms: headlineTerms() }),
    fields, noteId: (fact.noteId ?? null) as NoteId | null, collectionId: null,
  });
  const itemId = addEntryToList(listId, entryId);
  showToast({
    message: L.added,
    detail: statement.length > 80 ? `${statement.slice(0, 79)}…` : statement,
    actions: [open, { label: LABELS.swipeActions.undo, onClick: () => {
      removeEntryFromList(itemId);
      for (const t of trashedBy(() => useNoteStore.getState().deleteStructuredTagEntry(entryId as StructuredTagEntryId))) deleteForever(t);
    } }],
  });
  return entryId;
}

// "Add to interesting facts" on text selected in a note: the note is its origin (so a fact from an
// encrypted note is encrypted with it, and says where it came from).
export function addFactFromNote(text: string, fromNoteId: string | null): void {
  const from = fromNoteId ? useNoteStore.getState().notes[fromNoteId as NoteId] : undefined;
  const title = from && !isNoteLocked(from) ? noteView(from).title : '';
  addInterestingFact({ statement: text, noteId: from ? from.id : null, source: title ? L.fromNote(title) : undefined });
}
