import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { builtInList, ensureBuiltInList, type BuiltInListSpec } from '@/services/builtInLists';
import { addEntryToList, forgetEntryInLists } from '@/services/glossaryLists';
import { entryView, isEntryLocked } from '@/services/noteSecrets';
import { noteHasPassage, openNotePassage } from '@/services/notePassage';
import { deleteForever, trashedBy } from '@/services/trash';
import { showToast } from '@/components/Toast/showToast';
import { quoteHeadline, splitQuote } from '@/utils/factHeadline';
import { fieldText } from '@/config/structuredTagTypes';
import { LABELS } from '@/config/labels';
import type { List, ListId, ListTypeId } from '@/types/lists';
import type { NoteId, StructuredTagEntryId } from '@/types';

// Quotes (asked for by the user 2026-11-03): quotes worth keeping, the same way as Interesting
// facts (services/interestingFacts.ts). Each is a quote record, and the Quotes list in Lists is a
// Glossary list of them (services/glossaryLists.ts), though quotes aren't in the Glossary itself
// (OUTSIDE_GLOSSARY, the user 2026-11-11). Kept from selected text ("Add to quotes", a copy) or from
// a `\quote` block ("Send to Quotes"): the block stays as it is and remembers its record (`keptId`),
// and the record follows the block's words and attribution from then on (syncKeptQuotes), so a
// quote is written in one place. A record from a note keeps that note as where it came from, so a
// quote from an encrypted note is encrypted with it.

export const QUOTES_TYPE_ID = 'lt-quotes' as ListTypeId;
const L = LABELS.keptQuotes;
const QUOTES: BuiltInListSpec = { typeId: QUOTES_TYPE_ID, name: L.listName };

export const quotesList = (): List | null => builtInList(QUOTES);

const ATTRIBUTION = ['who', 'role', 'source', 'when', 'where'] as const;
export interface NewQuote { text: string; who?: string; role?: string; source?: string; when?: string; where?: string; link?: string | null; noteId?: string | null }

const openList = (listId: ListId) => () => { const ui = useUIStore.getState(); ui.setActiveView('lists'); ui.setActiveListId(listId); };
export function openQuotesList(): void { const id = quotesList()?.id; if (id) openList(id as ListId)(); }

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
const quoteFields = (q: NewQuote): Record<string, unknown> => {
  const fields: Record<string, unknown> = { text: clean(q.text) };
  for (const k of ATTRIBUTION) if (q[k]?.trim()) fields[k] = q[k]!.trim();
  if (q.link) fields.weblinks = [q.link];
  return fields;
};

// Makes a quote record and puts it in the Quotes list. Returns its id; `toast` false when the caller
// says so itself.
export function keepQuote(q: NewQuote, { toast = true }: { toast?: boolean } = {}): string | null {
  const text = clean(q.text);
  if (!text) return null;
  const listId = ensureBuiltInList(QUOTES);
  const entryId = useNoteStore.getState().addStructuredTagEntry({
    typeKey: 'quote', tagId: 'builtin-quote', term: quoteHeadline(text, q.who ?? ''), fields: quoteFields(q),
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

// What a `\quote` block says: its words and attribution, a hidden field's text included (hiding a
// field on the block doesn't take it out of Quotes).
export function quoteFromNode(node: PMNode): NewQuote {
  const q: NewQuote = { text: '' };
  const hidden = (node.attrs.hidden ?? {}) as Record<string, string>;
  for (const k of ATTRIBUTION) if (hidden[k]) q[k] = hidden[k];
  if (hidden.link) q.link = hidden.link;
  node.forEach((child) => {
    if (child.type.name === 'quoteText') q.text = child.textContent;
    else if (child.type.name === 'quoteField') {
      const field = child.attrs.field as string;
      const value = child.textContent.trim();
      if (field === 'link') q.link = value || null;
      else if ((ATTRIBUTION as readonly string[]).includes(field)) q[field as typeof ATTRIBUTION[number]] = value;
    }
  });
  return q;
}

// Whether a block's record is still there (not deleted).
export const keptRecordExists = (id: string | null | undefined): boolean =>
  !!id && !!useNoteStore.getState().structuredTagEntries[id as StructuredTagEntryId];

// A quote kept from a `\quote` block that its note still holds: written only there, so its record is
// shown read-only elsewhere (the Quotes list's record view), with a way to its block.
const keptBlockFind = (entryId: string) => ({ node: 'quoteBlock', attr: 'keptId', value: entryId });
export function isKeptFromBlock(entryId: string): boolean {
  const raw = useNoteStore.getState().structuredTagEntries[entryId as StructuredTagEntryId];
  return !!raw?.noteId && raw.typeKey === 'quote' && noteHasPassage(raw.noteId, keptBlockFind(entryId));
}
export function openKeptBlock(entryId: string): boolean {
  const raw = useNoteStore.getState().structuredTagEntries[entryId as StructuredTagEntryId];
  return !!raw?.noteId && openNotePassage(raw.noteId, keptBlockFind(entryId));
}

// "Send to Quotes" on a `\quote` block (its pill and right-click): keeps it as a quote record in the
// Quotes list and marks the block with it, the block staying as it is. A block already kept opens
// the list instead.
export function sendQuoteBlock(view: EditorView, pos: number, noteId: string | null): boolean {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'quoteBlock') return false;
  if (keptRecordExists(node.attrs.keptId)) { openQuotesList(); return true; }
  if (!view.editable) return false;
  const q = quoteFromNode(node);
  const entryId = keepQuote({ ...q, noteId }, { toast: false });
  if (!entryId) return false;
  view.dispatch(view.state.tr.setNodeAttribute(pos, 'keptId', entryId));
  const listId = quotesList()?.id;
  showToast({
    message: L.added, detail: q.text.length > 80 ? `${q.text.slice(0, 79)}…` : q.text,
    actions: [
      ...(listId ? [{ label: L.open, onClick: openList(listId as ListId) }] : []),
      { label: LABELS.swipeActions.undo, onClick: () => {
        forgetQuote(entryId);
        const at = findKeptBlock(view.state.doc, entryId);
        if (at !== null) view.dispatch(view.state.tr.setNodeAttribute(at, 'keptId', null));
      } },
    ],
  });
  return true;
}

function findKeptBlock(doc: PMNode, entryId: string): number | null {
  let at: number | null = null;
  doc.descendants((n, p) => {
    if (at !== null) return false;
    if (n.type.name === 'quoteBlock' && n.attrs.keptId === entryId) at = p;
    return at === null;
  });
  return at;
}

// Keeps each kept quote's record in step with its block (called by the quote block's plugin after
// the text changes). Only the block in the note the record came from feeds it, the first if the
// note holds several (a copy elsewhere shows as kept but doesn't write). A locked record is left.
// The headline follows the words unless it was written by hand.
export function syncKeptQuotes(doc: PMNode, noteId: string | null): void {
  if (!noteId) return;
  const store = useNoteStore.getState();
  const seen = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name !== 'quoteBlock') return !node.isTextblock;
    const id = node.attrs.keptId as string | null;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    const raw = store.structuredTagEntries[id as StructuredTagEntryId];
    if (!raw || raw.noteId !== noteId || isEntryLocked(raw)) return false;
    const cur = entryView(raw);
    const q = quoteFromNode(node);
    if (!clean(q.text)) return false;
    const fields: Record<string, unknown> = { ...cur.fields };
    for (const k of ATTRIBUTION) delete fields[k];
    const add = quoteFields(q);
    delete add.weblinks;
    Object.assign(fields, add);
    // The block's Link is the record's first link; links added in Quotes after it stay.
    const links = Array.isArray(cur.fields.weblinks) ? (cur.fields.weblinks as string[]) : [];
    if (q.link) fields.weblinks = [q.link, ...links.slice(1)];
    const auto = quoteHeadline(fieldText(cur.fields, 'text'), fieldText(cur.fields, 'who'));
    const term = !cur.term.trim() || cur.term === auto ? quoteHeadline(clean(q.text), q.who ?? '') : cur.term;
    if (term === cur.term && JSON.stringify(fields) === JSON.stringify(cur.fields)) return false;
    store.updateStructuredTagEntry(raw.id, { term, fields });
    return false;
  });
}

// A quote kept before 2026-11-11 became a Glossary card of its record; it's a quote block again,
// kept (the record unchanged). Returns the transaction, or null when the note has none (or the
// record can't be read: locked).
export function quoteCardsToBlocks(doc: PMNode, schema: Schema, tr: Transaction): Transaction | null {
  const { glossaryCard, quoteBlock, quoteText, quoteField } = schema.nodes;
  if (!glossaryCard || !quoteBlock) return null;
  const entries = useNoteStore.getState().structuredTagEntries;
  const found: { pos: number; size: number; node: PMNode }[] = [];
  doc.descendants((n, pos) => {
    if (n.type !== glossaryCard) return true;
    const raw = entries[n.attrs.entryId as StructuredTagEntryId];
    if (!raw || raw.typeKey !== 'quote' || isEntryLocked(raw)) return false;
    const e = entryView(raw);
    const f = (k: string) => fieldText(e.fields, k);
    const shown = ATTRIBUTION.filter((k) => f(k));
    const fields = (shown.length ? shown : ['who', 'source', 'when'] as const).map((k) => quoteField.create({ field: k }, f(k) ? schema.text(f(k)) : null));
    const link = Array.isArray(e.fields.weblinks) ? String((e.fields.weblinks as unknown[])[0] ?? '') : '';
    if (link) fields.push(quoteField.create({ field: 'link' }, schema.text(link)));
    const text = f('text');
    found.push({ pos, size: n.nodeSize, node: quoteBlock.create({ keptId: raw.id }, [quoteText.create(null, text ? schema.text(text) : null), ...fields]) });
    return false;
  });
  if (!found.length) return null;
  for (const { pos, size, node } of found.reverse()) tr.replaceWith(pos, pos + size, node);
  return tr;
}
