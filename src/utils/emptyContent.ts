import type { Note } from '@/types/notes';

// Whether something about to be deleted has anything in it. Deleting an empty thing doesn't ask
// (the user's rule, 2026-10-22: anything deleted asks first, unless it's empty) — pass the answer
// to confirmDelete's `empty` option. When it can't be known (an encrypted note while locked), it
// counts as not empty.

// Nodes that hold nothing by themselves: a note made of only these, with no text, is empty. Any
// other node (a picture, a block, a rule, a link to an item) is content.
const STRUCTURE = new Set(['doc', 'section', 'paragraph', 'heading', 'hardBreak', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote']);

interface JsonNode { type?: string; text?: string; content?: JsonNode[] }
const nodeIsEmpty = (n: JsonNode): boolean =>
  n.type === 'text' ? !(n.text ?? '').trim() : (!n.type || STRUCTURE.has(n.type)) && (n.content ?? []).every(nodeIsEmpty);

export function richTextIsEmpty(json: string | null | undefined): boolean {
  if (!json || !json.trim()) return true;
  try { return nodeIsEmpty(JSON.parse(json) as JsonNode); }
  catch { return false; }   // not JSON (shouldn't happen): treat as content, so it asks
}

// A note with no title, abstract or text on any tab, and no sub-notes.
export function noteIsEmpty(note: Pick<Note, 'isEncrypted' | 'title' | 'abstract' | 'content' | 'tabs'>, hasSubNotes: boolean): boolean {
  if (note.isEncrypted || hasSubNotes) return false;
  return !note.title.trim() && !(note.abstract ?? '').trim() && richTextIsEmpty(note.content) && note.tabs.every((t) => richTextIsEmpty(t.content));
}
