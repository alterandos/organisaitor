import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteStore } from '@/store/noteStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { NoteId } from '@/types';

// A Glossary record left in no note (2026-11-03): asked about once, the answer remembered on request.
const asked = vi.hoisted(() => ({ count: 0, list: undefined as string[] | undefined, result: 'confirm' as 'confirm' | 'alternate' | 'cancel', checked: false }));
vi.mock('@/components/ConfirmDialog/dialogs', () => ({
  confirmDelete: async () => true,
  askWithCheckbox: async (o: { list?: string[] }) => { asked.count++; asked.list = o.list; return { result: asked.result, checked: asked.checked }; },
}));

const { askAboutOrphans, entriesOnlyIn } = await import('./glossaryOrphans');
const { deleteNoteAsked } = await import('./noteDelete');

const doc = (marks: string[]) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: marks.map((id) => ({ type: 'text', text: 'term', marks: [{ type: 'conceptRef', attrs: { entryId: id, typeKey: 'definition' } }] })) }] });
const record = (noteId: string | null, term: string) => useNoteStore.getState().addStructuredTagEntry({ typeKey: 'definition', tagId: 'builtin-definition', term, fields: {}, noteId: noteId as NoteId | null, collectionId: null });

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useSettingsStore.getState().setGlossaryOrphans('ask');
  Object.assign(asked, { count: 0, list: undefined, result: 'confirm', checked: false });
});

describe('Glossary records left in no note', () => {
  it('deleting a note asks only about the records no other note holds, listing them; kept, they stay', async () => {
    const a = useNoteStore.getState().addNote({ title: 'A' });
    const b = useNoteStore.getState().addNote({ title: 'B' });
    const only = record(a, 'Osmosis');
    const only2 = record(a, 'Turgor');
    const shared = record(a, 'Diffusion');
    useNoteStore.getState().updateNote(a as NoteId, { content: doc([only, only2, shared]) });
    useNoteStore.getState().updateNote(b as NoteId, { content: doc([shared]) });
    expect(entriesOnlyIn(a).sort()).toEqual([only, only2].sort());
    expect(await deleteNoteAsked(a, 'A', { empty: false })).toBe(true);
    expect(asked.count).toBe(1);
    expect(asked.list?.length).toBe(2);
    expect(Object.keys(useNoteStore.getState().structuredTagEntries).sort()).toEqual([only, only2, shared].sort());
  });

  it('chosen Delete, they go with the note; Cancel keeps the note', async () => {
    const a = useNoteStore.getState().addNote({ title: 'A' });
    const only = record(a, 'Osmosis');
    useNoteStore.getState().updateNote(a as NoteId, { content: doc([only]) });
    asked.result = 'cancel';
    expect(await deleteNoteAsked(a, 'A', { empty: false })).toBe(false);
    expect(useNoteStore.getState().notes[a as NoteId]).toBeDefined();
    asked.result = 'alternate';
    expect(await deleteNoteAsked(a, 'A', { empty: false })).toBe(true);
    expect(useNoteStore.getState().structuredTagEntries[only as never]).toBeUndefined();
  });

  it('"Don\'t ask again" remembers the answer; after that nothing is asked', async () => {
    const id = record(null, 'Osmosis');
    asked.checked = true;
    asked.result = 'alternate';
    expect(await askAboutOrphans([id], 'card')).toBe('delete');
    expect(useSettingsStore.getState().glossaryOrphans).toBe('delete');
    expect(await askAboutOrphans([id], 'note')).toBe('delete');
    expect(asked.count).toBe(1);
  });
});
