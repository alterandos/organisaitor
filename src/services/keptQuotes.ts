import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection } from '@tiptap/pm/state';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { builtInList, ensureBuiltInList, type BuiltInListSpec } from '@/services/builtInLists';
import { addEntryToList, forgetEntryInLists } from '@/services/glossaryLists';
import { deleteForever, trashedBy } from '@/services/trash';
import { showToast } from '@/components/Toast/showToast';
import { quoteHeadline, splitQuote } from '@/utils/factHeadline';
import { LABELS } from '@/config/labels';
import type { List, ListId, ListTypeId } from '@/types/lists';
import type { NoteId, StructuredTagEntryId } from '@/types';

// Quotes (asked for by the user 2026-11-03): quotes worth keeping, the same way as Interesting
// facts (services/interestingFacts.ts). Each is a Quote record in the Glossary, and the Quotes list
// in Lists is a Glossary list of them (services/glossaryLists.ts). Kept from selected text ("Add to
// quotes") or from a `\quote` block, which then becomes a card of the record (decided with the user:
// one copy, converted when sent). A record from a note keeps that note as where it came from, so a
// quote from an encrypted note is encrypted with it.

export const QUOTES_TYPE_ID = 'lt-quotes' as ListTypeId;
const L = LABELS.keptQuotes;
const QUOTES: BuiltInListSpec = { typeId: QUOTES_TYPE_ID, name: L.listName };

export const quotesList = (): List | null => builtInList(QUOTES);

export interface NewQuote { text: string; who?: string; role?: string; source?: string; when?: string; where?: string; link?: string | null; noteId?: string | null }

const openList = (listId: ListId) => () => { const ui = useUIStore.getState(); ui.setActiveView('lists'); ui.setActiveListId(listId); };

// Makes a Quote record and puts it in the Quotes list. Returns its id; `toast` false when the caller
// says so itself.
export function keepQuote(q: NewQuote, { toast = true }: { toast?: boolean } = {}): string | null {
  const text = q.text.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const listId = ensureBuiltInList(QUOTES);
  const fields: Record<string, unknown> = { text };
  for (const k of ['who', 'role', 'source', 'when', 'where'] as const) if (q[k]?.trim()) fields[k] = q[k]!.trim();
  if (q.link) fields.weblinks = [q.link];
  const entryId = useNoteStore.getState().addStructuredTagEntry({
    typeKey: 'quote', tagId: 'builtin-quote', term: quoteHeadline(text, q.who ?? ''), fields,
    noteId: (q.noteId ?? null) as NoteId | null, collectionId: null,
  });
  addEntryToList(listId, entryId);
  if (toast) {
    showToast({
      message: L.added,
      detail: text.length > 80 ? `${text.slice(0, 79)}…` : text,
      actions: [{ label: L.open, onClick: openList(listId) }, { label: LABELS.swipeActions.undo, onClick: () => forgetQuote(entryId) }],
    });
  }
  return entryId;
}

function forgetQuote(entryId: string): void {
  forgetEntryInLists(entryId);
  for (const t of trashedBy(() => useNoteStore.getState().deleteStructuredTagEntry(entryId as StructuredTagEntryId))) deleteForever(t);
}

// "Add to quotes" on text selected in a note: who said it read from the selection when it says.
export function addQuoteFromNote(selected: string, fromNoteId: string | null): void {
  const { text, who } = splitQuote(selected);
  keepQuote({ text, who, noteId: fromNoteId });
}

// A `\quote` block sent to Quotes (its right-click, "Keep in Quotes"): its words and shown fields
// become a Quote record, and the block becomes a card of it, in its place (one undo step). The
// block's hidden fields, kept only while hidden, aren't taken.
export function quoteBlockToRecord(view: EditorView, pos: number, noteId: string | null): boolean {
  const node = view.state.doc.nodeAt(pos);
  const card = view.state.schema.nodes.glossaryCard;
  if (!node || node.type.name !== 'quoteBlock' || !card || !view.editable) return false;
  const q: NewQuote = { text: '', noteId };
  node.forEach((child) => {
    if (child.type.name === 'quoteText') q.text = child.textContent;
    else if (child.type.name === 'quoteField') {
      const field = child.attrs.field as string;
      const value = child.textContent.trim();
      if (field === 'link') q.link = value || null;
      else if (field === 'who' || field === 'role' || field === 'source' || field === 'when' || field === 'where') q[field] = value;
    }
  });
  const entryId = keepQuote(q, { toast: false });
  if (!entryId) return false;
  const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, card.create({ entryId }));
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)).scrollIntoView());
  const listId = quotesList()?.id;
  showToast({ message: L.added, detail: q.text.length > 80 ? `${q.text.slice(0, 79)}…` : q.text, actions: listId ? [{ label: L.open, onClick: openList(listId as ListId) }] : [] });
  return true;
}
