import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { draftsFromText } from '@/utils/listDrafts';
import type { ListId, ListTypeId } from '@/types/lists';
import type { NoteId } from '@/types';

// Send to ▸ A list… and Glossary lists (2026-11-03).
const confirmed = vi.hoisted(() => ({ count: 0, answer: true }));
vi.mock('@/components/ConfirmDialog/dialogs', () => ({ confirmDialog: async () => { confirmed.count++; return confirmed.answer; }, confirmDelete: async () => true }));
vi.mock('@/components/Toast/showToast', () => ({ showToast: () => {} }));

const { sendDraftsToList, itemSource } = await import('./sendToList');
const { glossaryListRows } = await import('./glossaryLists');
const { addInterestingFact, factsList, hasFact } = await import('./interestingFacts');

beforeEach(() => {
  useListStore.setState(useListStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  Object.assign(confirmed, { count: 0, answer: true });
});

describe('sending note text to a list', () => {
  it('makes the checked items, fields filled, each remembering the passage it came from', async () => {
    const listId = useListStore.getState().addList({ name: 'Books I own', typeId: 'lt-custom' as ListTypeId, kind: 'reference', fieldSchema: [{ id: 'author', name: 'Author', type: 'text' }] });
    const list = useListStore.getState().lists[listId];
    const drafts = draftsFromText('Dune\nAuthor: Frank Herbert', list.fieldSchema, false);
    expect(await sendDraftsToList(listId as ListId, drafts, { noteId: 'n1', tabId: null, blockId: 'b1' })).toBe(1);
    const [item] = Object.values(useListStore.getState().listItems);
    expect(item).toMatchObject({ title: 'Dune', data: { author: 'Frank Herbert' } });
    expect(itemSource(item)).toEqual({ noteId: 'n1', tabId: null, blockId: 'b1' });
  });

  it('from an encrypted note into a list that isn\'t, asks first; cancelled, nothing goes', async () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Secret' }) as NoteId;
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [noteId]: { ...s.notes[noteId], isEncrypted: true } } }));
    const listId = useListStore.getState().addList({ name: 'Plain', typeId: 'lt-custom' as ListTypeId, kind: 'reference' }) as ListId;
    confirmed.answer = false;
    expect(await sendDraftsToList(listId, [{ title: 'x', data: {}, notes: '' }], { noteId, tabId: null, blockId: null })).toBe(0);
    expect(confirmed.count).toBe(1);
    expect(Object.values(useListStore.getState().listItems)).toHaveLength(0);
  });
});

describe('Glossary lists', () => {
  it('Interesting facts: a kept fact is a Fact record in the Glossary, its row in the list the record itself', () => {
    const id = addInterestingFact({ statement: 'Honey never spoils.', source: 'Wikipedia' })!;
    const raw = useNoteStore.getState().structuredTagEntries[id as never];
    expect(raw).toMatchObject({ typeKey: 'fact', term: 'Honey', noteId: null, fields: { statement: 'Honey never spoils.', source: 'Wikipedia' } });
    const rows = glossaryListRows(factsList()!.id);
    expect(rows.map((r) => r.entry.id)).toEqual([id]);
    expect(hasFact('honey never  spoils.')).toBe(true);
    // Edited as a record, the list shows the change: one copy.
    useNoteStore.getState().updateStructuredTagEntry(id as never, { term: 'Honey keeps' });
    expect(glossaryListRows(factsList()!.id)[0].entry.term).toBe('Honey keeps');
  });

  it('sent to a Glossary list, each item becomes a record of its kind there, from that note', async () => {
    addInterestingFact({ statement: 'Octopuses have three hearts.' });
    const listId = factsList()!.id as ListId;
    await sendDraftsToList(listId, draftsFromText('- Bananas are berries.\n- Venus spins backwards.', [], true), { noteId: 'n2', tabId: null, blockId: null });
    const rows = glossaryListRows(listId);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.entry.noteId === 'n2').map((r) => r.entry.term).sort()).toEqual(['Bananas', 'Venus spins backwards']);
  });
});

describe('Quotes (2026-11-03)', () => {
  it('a quote from selected text is a Quote record, who said it read from the text, its row in the Quotes list', async () => {
    const { addQuoteFromNote, quotesList } = await import('./keptQuotes');
    addQuoteFromNote('“Stay hungry, stay foolish.” — Steve Jobs', 'n9');
    const rows = glossaryListRows(quotesList()!.id);
    expect(rows).toHaveLength(1);
    const raw = useNoteStore.getState().structuredTagEntries[rows[0].entry.id as never];
    expect(raw).toMatchObject({ typeKey: 'quote', noteId: 'n9', term: 'Steve Jobs: Stay hungry, stay foolish', fields: { text: 'Stay hungry, stay foolish.', who: 'Steve Jobs' } });
  });
});
