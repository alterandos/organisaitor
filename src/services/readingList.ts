import { useListStore } from '@/store/listStore';
import { itemView } from '@/services/listSecrets';
import { builtInList, builtInListItem, ensureBuiltInList, type BuiltInListSpec } from '@/services/builtInLists';
import { showToast } from '@/components/Toast/showToast';
import { log, errorMessage } from '@/utils/log';
import { LABELS } from '@/config/labels';
import type { List, ListId, ListItemId, ListTypeId } from '@/types/lists';

// The reading list (2026-11-01): books to read, sent from a note ("Add to reading list" on selected
// text), as the Dictionary takes words. A Books list (the built-in template) named "Reading list",
// made the first time a book is added. What's missing (the title as published, the author, the
// year) is looked up on Open Library (free, no key) and filled in where still empty.

export const BOOKS_TYPE_ID = 'lt-books' as ListTypeId;
export const BOOK_FIELDS = { author: 'lf-author', year: 'lf-year', source: 'lf-source' } as const;
const L = LABELS.readingList;

export interface BookInfo { title: string; author: string; year: number | null }

// A built-in list fed from elsewhere (services/builtInLists.ts). Books is a general type, so the
// reading list is also known by its name.
const READING_LIST: BuiltInListSpec = { typeId: BOOKS_TYPE_ID, name: L.listName, matchName: true };

export const readingList = (): List | null => builtInList(READING_LIST);

// A reading list made before Year was added to the template gains it.
const ensureReadingList = (): ListId => ensureBuiltInList(READING_LIST);

// The best match on Open Library for a title (and maybe its author) as typed, or null.
export async function fetchBook(query: string): Promise<BookInfo | null> {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1&fields=title,author_name,first_publish_year`);
    if (!res.ok) return null;
    return readBook(await res.json());
  } catch (e) {
    log.warn('readingList', 'book lookup failed', errorMessage(e));
    return null;
  }
}

export function readBook(json: unknown): BookInfo | null {
  const doc = (json as { docs?: { title?: unknown; author_name?: unknown; first_publish_year?: unknown }[] })?.docs?.[0];
  if (!doc || typeof doc.title !== 'string') return null;
  const authors = Array.isArray(doc.author_name) ? doc.author_name.filter((a): a is string => typeof a === 'string') : [];
  return { title: doc.title, author: authors.slice(0, 2).join(', '), year: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null };
}

const cleanTitle = (text: string) => text.trim().replace(/\s+/g, ' ').replace(/^["“'‘]+|["”'’.,;:]+$/g, '');

// Adds a book (or finds the one already there), then fills in what the lookup found where it's
// still empty. Says what happened in a toast, with Undo while it's new.
export async function addToReadingList(text: string, fromNoteTitle: string | null): Promise<void> {
  const typed = cleanTitle(text);
  if (!typed) return;
  const listId = ensureReadingList();
  const already = builtInListItem(listId, typed);
  if (already) { showToast({ message: L.already(itemView(already).title) }); return; }
  const itemId: ListItemId = useListStore.getState().addListItem({
    listId, title: typed, data: fromNoteTitle ? { [BOOK_FIELDS.source]: L.fromNote(fromNoteTitle) } : {},
  });
  const book = await fillBookDetails(itemId, typed);
  if (!useListStore.getState().listItems[itemId]) return;
  const undo = { label: LABELS.swipeActions.undo, onClick: () => useListStore.getState().deleteListItem(itemId) };
  if (!book) { showToast({ message: L.added(typed), detail: L.notFound, actions: [undo] }); return; }
  showToast({ message: L.added(itemView(useListStore.getState().listItems[itemId]).title), detail: L.found(book.author, book.year != null ? String(book.year) : '') || undefined, actions: [undo] });
}

// A book item's missing details (the title as published, the author, the year) looked up on Open
// Library and filled in where still empty; any Books list's items, sent to it (services/sendToList.ts).
export async function fillBookDetails(itemId: ListItemId, typed: string): Promise<BookInfo | null> {
  const book = await fetchBook(typed);
  const now = useListStore.getState().listItems[itemId];
  if (!book || !now) return null;
  const item = itemView(now);
  const data = { ...item.data };
  if (!String(data[BOOK_FIELDS.author] ?? '').trim() && book.author) data[BOOK_FIELDS.author] = book.author;
  if (data[BOOK_FIELDS.year] == null && book.year != null) data[BOOK_FIELDS.year] = book.year;
  const title = item.title === typed ? book.title : item.title;
  useListStore.getState().updateListItem(itemId, { title, data });
  return book;
}
