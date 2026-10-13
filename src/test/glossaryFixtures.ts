import { useNoteStore } from '@/store/noteStore';
import type { NoteId, StructuredTagEntryId } from '@/types';

// A Glossary record only counts while its note holds its card (or old marked text): see
// services/glossary.ts stillDefined. Tests that make a record directly in the store put its card
// in its note with this, as a real one would be.
export function defineInItsNote(entryId: string): void {
  const store = useNoteStore.getState();
  const entry = store.structuredTagEntries[entryId as StructuredTagEntryId];
  const note = entry ? store.notes[entry.noteId as NoteId] : undefined;
  if (!entry || !note) return;
  let doc: { type: string; content: unknown[] } = { type: 'doc', content: [] };
  try { if (note.content) doc = JSON.parse(note.content); } catch { /* not JSON: start a new document */ }
  doc.content = [...(doc.content ?? []), { type: 'glossaryCard', attrs: { entryId } }];
  store.updateNote(note.id, { content: JSON.stringify(doc) });
}
