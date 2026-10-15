// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useSettingsStore } from '@/store/settingsStore';
import { addToDictionary, cleanWord, dictionaryList, dictionaryWords, fetchDefinition, findDictionaryWords, wordUseCount, DICT_FIELDS } from './dictionary';
import { DictionaryWords } from '@/components/NoteEditor/extensions/DictionaryWords';
import type { NoteId } from '@/types';

const freeDictionary = (definition: string) => ({ ok: true, json: async () => [{ meanings: [{ partOfSpeech: 'adjective', definitions: [{ definition, example: 'An ephemeral joy.' }] }] }] });
const notFound = { ok: false, json: async () => ({}) };

beforeEach(() => {
  useListStore.setState(useListStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('the Dictionary', () => {
  it('cleans what was selected into a word', () => {
    expect(cleanWord('  “ephemeral,” ')).toBe('ephemeral');
    expect(cleanWord('in   situ')).toBe('in situ');
    expect(cleanWord('...')).toBe('');
  });

  it('adds a word to a built-in Dictionary list (made the first time), dated today, its meaning fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => freeDictionary('Lasting a very short time.')));
    const r = await addToDictionary('Ephemeral');
    expect(r).toMatchObject({ existed: false, found: true });
    const list = dictionaryList()!;
    expect(list.name).toBe('Dictionary');
    const item = useListStore.getState().listItems[r!.itemId];
    expect(item.title).toBe('Ephemeral');
    expect(item.data[DICT_FIELDS.meaning]).toBe('Lasting a very short time.');
    expect(item.data[DICT_FIELDS.partOfSpeech]).toBe('adjective');
    expect(item.data[DICT_FIELDS.example]).toBe('An ephemeral joy.');
    expect(list.fieldSchema.map((f) => f.id)).toEqual(expect.arrayContaining([DICT_FIELDS.partOfSpeech, DICT_FIELDS.example]));
    expect(item.data[DICT_FIELDS.source]).toBe('Free Dictionary API');
    expect(item.data[DICT_FIELDS.added]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // A second time, any case: the same word, not a new one.
    expect(await addToDictionary('ephemeral')).toMatchObject({ existed: true, itemId: r!.itemId });
    expect(Object.keys(useListStore.getState().listItems).filter((id) => useListStore.getState().listItems[id as never].listId === list.id)).toHaveLength(1);
  });

  it('falls back to Wiktionary; with nothing found (or offline) the word is kept, its meaning left to write', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('wiktionary')
      ? { ok: true, json: async () => ({ en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'A <b>small</b> thing', examples: ['a <i>mote</i> of dust'] }] }] }) }
      : notFound)));
    expect(await fetchDefinition('mote')).toEqual({ meaning: 'A small thing', partOfSpeech: 'noun', example: 'a mote of dust', source: 'Wiktionary (CC BY-SA)' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const r = await addToDictionary('zzyzx');
    expect(r).toMatchObject({ existed: false, found: false });
    expect(dictionaryWords().get('zzyzx')?.meaning).toBe('');
  });

  it('a meaning written while the lookup was on its way is kept', async () => {
    let answer: (v: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { answer = r; })));
    const pending = addToDictionary('liminal');
    await Promise.resolve();
    const w = dictionaryWords().get('liminal')!;
    const item = useListStore.getState().listItems[w.itemId];
    useListStore.getState().updateListItem(w.itemId, { data: { ...item.data, [DICT_FIELDS.meaning]: 'My own meaning' } });
    answer(freeDictionary('Occupying a threshold.'));
    await pending;
    expect(dictionaryWords().get('liminal')?.meaning).toBe('My own meaning');
  });

  it('finds whole words in text, any case, longest first; counts uses across the notes', () => {
    expect(findDictionaryWords('An ephemeral, EPHEMERAL thing; not ephemerally.', ['ephemeral'])).toEqual([
      { from: 3, to: 12, key: 'ephemeral' }, { from: 14, to: 23, key: 'ephemeral' },
    ]);
    expect(findDictionaryWords('in situ testing', ['situ', 'in situ']).map((h) => h.key)).toEqual(['in situ']);
    const id = useNoteStore.getState().addNote({ title: 'A' });
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ephemeral joys are ephemeral.' }] }] };
    useNoteStore.getState().updateNote(id as NoteId, { content: JSON.stringify(doc) });
    expect(wordUseCount('ephemeral')).toBe(2);
  });

  it('every occurrence in a note is underlined (not in code), and the setting turns it off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notFound));
    await addToDictionary('ephemeral');
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, DictionaryWords],
      content: '<p>Ephemeral and ephemeral.</p><pre><code>ephemeral</code></pre><p>Not <code>ephemeral</code></p>',
    });
    expect(editor.view.dom.querySelectorAll('[data-dict-word]')).toHaveLength(2);
    useSettingsStore.getState().toggleDictionaryHighlight();
    expect(editor.view.dom.querySelectorAll('[data-dict-word]')).toHaveLength(0);
    useSettingsStore.getState().toggleDictionaryHighlight();
    await addToDictionary('and');
    expect(editor.view.dom.querySelectorAll('[data-dict-word]')).toHaveLength(3);
    editor.destroy();
  });
});
