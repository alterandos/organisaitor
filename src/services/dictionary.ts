import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { isListLocked, itemView, listView } from '@/services/listSecrets';
import { getNoteTabTexts } from '@/utils/noteSearchText';
import { todayIso } from '@/utils/date';
import { log, errorMessage } from '@/utils/log';
import { LABELS } from '@/config/labels';
import type { List, ListId, ListItemId, ListTypeId } from '@/types/lists';

// The Dictionary (asked for 2026-10-15): everyday words the user wants to keep, as a built-in list
// in Lists (type DICTIONARY_TYPE_ID; made the first time a word is added). Different from the
// Glossary, which is for the terms a subject is built on: this is general vocabulary. A word's
// meaning is fetched from the internet when it's added (Wiktionary, then the Free Dictionary API),
// unless the user writes their own; every occurrence of a dictionary word in a note shows it on
// hover (extensions/DictionaryWords.ts), with how often it's used across the notes — counted when
// asked, from the notes' search text, never tracked while typing.

export const DICTIONARY_TYPE_ID = 'lt-dictionary' as ListTypeId;
export const DICT_FIELDS = { meaning: 'lf-meaning', partOfSpeech: 'lf-pos', example: 'lf-example', source: 'lf-source', added: 'lf-added' } as const;

export interface DictionaryWord { itemId: ListItemId; word: string; meaning: string; partOfSpeech: string; example: string; source: string; added: string }

export interface Definition { meaning: string; partOfSpeech: string; example: string; source: string }

// The Dictionary list, if there is one (the first, when there are several); a locked one is
// treated as absent (its words can't be read).
export function dictionaryList(): List | null {
  const lists = Object.values(useListStore.getState().lists).filter((l) => !isListLocked(l) && listView(l).typeId === DICTIONARY_TYPE_ID);
  lists.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return lists[0] ?? null;
}

// A Dictionary list made before a field was added to the type (part of speech, example) gains it:
// when a word is added, and when the list is opened (ListsSection).
export function refreshDictionaryFields(): void {
  const existing = dictionaryList();
  if (!existing) return;
  const have = new Set(listView(existing).fieldSchema.map((f) => f.id));
  const missing = (useListStore.getState().listTypes[DICTIONARY_TYPE_ID]?.defaultFields ?? []).filter((f) => !have.has(f.id));
  if (missing.length) useListStore.getState().updateList(existing.id, { fieldSchema: [...listView(existing).fieldSchema, ...missing] });
}

function ensureDictionaryList(): ListId {
  const existing = dictionaryList();
  const type = useListStore.getState().listTypes[DICTIONARY_TYPE_ID];
  if (existing) {
    refreshDictionaryFields();
    return existing.id;
  }
  return useListStore.getState().addList({
    name: LABELS.dictionary.listName,
    typeId: DICTIONARY_TYPE_ID,
    kind: 'reference',
    icon: type?.icon ?? null,
    color: type?.color ?? null,
    fieldSchema: type?.defaultFields,
  });
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// Every word in the Dictionary, by its lower-case form.
export function dictionaryWords(): Map<string, DictionaryWord> {
  const list = dictionaryList();
  const out = new Map<string, DictionaryWord>();
  if (!list) return out;
  for (const raw of Object.values(useListStore.getState().listItems)) {
    if (raw.listId !== list.id) continue;
    const item = itemView(raw);
    const word = item.title.trim();
    if (!word) continue;
    out.set(word.toLowerCase(), {
      itemId: item.id, word,
      meaning: str(item.data[DICT_FIELDS.meaning]),
      partOfSpeech: str(item.data[DICT_FIELDS.partOfSpeech]),
      example: str(item.data[DICT_FIELDS.example]),
      source: str(item.data[DICT_FIELDS.source]),
      added: str(item.data[DICT_FIELDS.added]) || item.createdAt.slice(0, 10),
    });
  }
  return out;
}

// What was selected, as a dictionary word: trimmed, without punctuation at either end.
export const cleanWord = (text: string): string => text.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/\s+/g, ' ');

// A word's meaning from the internet: its first sense with its part of speech and an example of
// it in use (when the source gives one), or null (offline, not found, or an answer we can't read).
// Read defensively: it comes from outside the app.
const htmlText = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';

// Wiktionary first (asked for 2026-10-16: the Free Dictionary API went down, which the browser
// reports as a CORS error); it answers cross-origin. Its English entries come before Translingual
// ones, and senses that are only a label (empty once the HTML is gone) are skipped.
async function fromWiktionary(w: string): Promise<Definition | null> {
  const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${w}`);
  if (!res.ok) return null;
  type Sense = { partOfSpeech?: unknown; language?: unknown; definitions?: { definition?: unknown; examples?: unknown }[] };
  const data = await res.json() as { en?: unknown };
  const senses = (Array.isArray(data.en) ? data.en as Sense[] : []).slice()
    .sort((a, b) => Number(b?.language === 'English') - Number(a?.language === 'English'));
  for (const sense of senses) {
    for (const d of Array.isArray(sense?.definitions) ? sense.definitions : []) {
      if (typeof d?.definition !== 'string') continue;
      const text = htmlText(d.definition);
      if (!text) continue;
      const ex = Array.isArray(d.examples) ? d.examples.find((x): x is string => typeof x === 'string') : undefined;
      return {
        meaning: text,
        partOfSpeech: typeof sense.partOfSpeech === 'string' ? sense.partOfSpeech.toLowerCase() : '',
        example: ex ? htmlText(ex) : '',
        source: LABELS.dictionary.sourceWiktionary,
      };
    }
  }
  return null;
}

async function fromFreeDictionary(w: string): Promise<Definition | null> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${w}`);
  if (!res.ok) return null;
  const data: unknown = await res.json();
  const first = Array.isArray(data) ? data[0] as { meanings?: { partOfSpeech?: unknown; definitions?: { definition?: unknown; example?: unknown }[] }[] } : null;
  const m = first?.meanings?.find((x) => typeof x?.definitions?.[0]?.definition === 'string');
  const d = m?.definitions?.[0];
  if (typeof d?.definition !== 'string' || !d.definition.trim()) return null;
  return {
    meaning: d.definition.trim(),
    partOfSpeech: typeof m?.partOfSpeech === 'string' ? m.partOfSpeech.toLowerCase() : '',
    example: typeof d.example === 'string' ? d.example.trim() : '',
    source: LABELS.dictionary.sourceFreeDictionary,
  };
}

export async function fetchDefinition(word: string): Promise<Definition | null> {
  const w = encodeURIComponent(word.toLowerCase());
  try {
    const def = await fromWiktionary(w);
    if (def) return def;
  } catch (e) { log.warn('dictionary', 'Wiktionary failed', errorMessage(e)); }
  try {
    return await fromFreeDictionary(w);
  } catch (e) { log.warn('dictionary', 'Free Dictionary API failed', errorMessage(e)); }
  return null;
}

// Adds a word (or returns the one already there, `existed` true), its date added today, then fills
// in its meaning from the internet unless one has been written meanwhile. Resolves once the meaning
// has been looked up; the word is in the Dictionary before that.
export async function addToDictionary(text: string): Promise<{ itemId: ListItemId; existed: boolean; found: boolean } | null> {
  const word = cleanWord(text);
  if (!word) return null;
  const have = dictionaryWords().get(word.toLowerCase());
  if (have) return { itemId: have.itemId, existed: true, found: !!have.meaning };
  const listId = ensureDictionaryList();
  const itemId = useListStore.getState().addListItem({
    listId, title: word, data: { [DICT_FIELDS.meaning]: '', [DICT_FIELDS.partOfSpeech]: '', [DICT_FIELDS.example]: '', [DICT_FIELDS.source]: '', [DICT_FIELDS.added]: todayIso() },
  });
  const def = await fetchDefinition(word);
  const now = useListStore.getState().listItems[itemId];
  if (!def || !now) return { itemId, existed: false, found: false };
  if (str(itemView(now).data[DICT_FIELDS.meaning]).trim()) return { itemId, existed: false, found: true };
  useListStore.getState().updateListItem(itemId, { data: {
    ...itemView(now).data,
    [DICT_FIELDS.meaning]: def.meaning, [DICT_FIELDS.partOfSpeech]: def.partOfSpeech, [DICT_FIELDS.example]: def.example, [DICT_FIELDS.source]: def.source,
  } });
  return { itemId, existed: false, found: true };
}

// How often a word appears across the notes (whole words, any case). Counted from the notes'
// search text (the first part of each tab; encrypted notes left out), so it's quick but approximate
// for very long notes.
export function wordUseCount(word: string): number {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu');
  let n = 0;
  for (const note of Object.values(useNoteStore.getState().notes)) {
    if (note.archivedAt) continue;
    for (const tab of getNoteTabTexts(note)) n += tab.text.match(re)?.length ?? 0;
  }
  return n;
}

// Where each dictionary word occurs in `text`: whole words, any case, longest first so a phrase
// wins over a word inside it. Pure: the editor's underlining reads it.
export function findDictionaryWords(text: string, words: Iterable<string>): { from: number; to: number; key: string }[] {
  const keys = [...words].filter(Boolean).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return [];
  const esc = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${esc.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const out: { from: number; to: number; key: string }[] = [];
  for (const m of text.matchAll(re)) out.push({ from: m.index, to: m.index + m[0].length, key: m[0].toLowerCase().replace(/\s+/g, ' ') });
  return out;
}
