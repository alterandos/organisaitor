import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListStore } from '@/store/listStore';
import { addToReadingList, readBook, readingList, BOOK_FIELDS } from './readingList';

beforeEach(() => {
  useListStore.setState(useListStore.getInitialState(), true);
});
afterEach(() => vi.unstubAllGlobals());

const openLibrary = (docs: unknown[]) => vi.fn(async () => ({ ok: true, json: async () => ({ docs }) }));

describe('the reading list', () => {
  it('reads the best Open Library match', () => {
    expect(readBook({ docs: [{ title: 'To Kill a Mockingbird', author_name: ['Harper Lee'], first_publish_year: 1960 }] }))
      .toEqual({ title: 'To Kill a Mockingbird', author: 'Harper Lee', year: 1960 });
    expect(readBook({ docs: [] })).toBeNull();
    expect(readBook(null)).toBeNull();
  });

  it('is made the first time, with Year; the book gets its published title, author and year', async () => {
    vi.stubGlobal('fetch', openLibrary([{ title: 'To Kill a Mockingbird', author_name: ['Harper Lee'], first_publish_year: 1960 }]));
    await addToReadingList('to kill a mocking bird', 'Lit notes');
    const list = readingList()!;
    expect(list.fieldSchema.map((f) => f.id)).toContain(BOOK_FIELDS.year);
    const items = Object.values(useListStore.getState().listItems).filter((i) => i.listId === list.id);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('To Kill a Mockingbird');
    expect(items[0].data).toMatchObject({ [BOOK_FIELDS.author]: 'Harper Lee', [BOOK_FIELDS.year]: 1960 });
    expect(String(items[0].data[BOOK_FIELDS.source])).toContain('Lit notes');
  });

  it('not found online: the book is still added, as typed; added twice: once', async () => {
    vi.stubGlobal('fetch', openLibrary([]));
    await addToReadingList('An Obscure Pamphlet', null);
    await addToReadingList('an obscure pamphlet', null);
    const items = Object.values(useListStore.getState().listItems).filter((i) => i.listId === readingList()!.id);
    expect(items.map((i) => i.title)).toEqual(['An Obscure Pamphlet']);
  });
});
