import type { Note } from '@/types/notes';
import { noteContentToText } from '@/utils/noteContent';
import { MAIN_TAB_ID } from '@/utils/noteTabs';

const SEARCH_TEXT_CHARS = 12000;

export interface NoteTabText {
  id:   string;   // MAIN_TAB_ID or a NoteTab id
  name: string;
  text: string;
}

// Turning a note's stored Tiptap JSON into plain text is the expensive part of searching notes
// (a JSON.parse plus a tree walk per note and tab), so it's done once per note version and
// remembered for the session. Keyed by note id and invalidated by a change to updatedAt or to any
// tab's content length. Encrypted notes' text is never cached — plaintext must not outlive the
// vault being unlocked (see services/noteSecrets.ts) — so their tabs read as empty text.
const cache = new Map<string, { version: string; tabs: NoteTabText[] }>();

// The note's main tab first, then its other tabs in stored order, each with its own plain text.
export function getNoteTabTexts(note: Note): NoteTabText[] {
  const mainName = note.mainTabName || 'Main';
  if (note.isEncrypted) {
    cache.delete(note.id);
    return [{ id: MAIN_TAB_ID, name: mainName, text: '' }, ...note.tabs.map((t) => ({ id: t.id, name: t.name, text: '' }))];
  }
  const version = `${note.updatedAt}|${note.content.length}|${note.tabs.map((t) => `${t.id}:${t.name}:${t.content.length}`).join(',')}`;
  const hit = cache.get(note.id);
  if (hit && hit.version === version) return hit.tabs;
  const tabs: NoteTabText[] = [
    { id: MAIN_TAB_ID, name: mainName, text: noteContentToText(note.content, SEARCH_TEXT_CHARS) },
    ...note.tabs.map((t) => ({ id: t.id, name: t.name, text: noteContentToText(t.content, SEARCH_TEXT_CHARS) })),
  ];
  cache.set(note.id, { version, tabs });
  return tabs;
}
