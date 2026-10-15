import { useNoteStore } from '@/store/noteStore';
import { useStickyStore, DEFAULT_STICKY_PLACE } from '@/store/stickyStore';
import { deleteNoteWithCleanup } from '@/services/crossAppLinkCleanup';
import { editNoteContent } from '@/services/noteContentEdit';
import { trashedBy, restoreAllFromTrash } from '@/services/trash';
import { useUIStore } from '@/store/uiStore';
import { showToast } from '@/components/Toast/showToast';
import { LABELS } from '@/config/labels';
import type { Note, NoteId, NoteTag, NoteTagId } from '@/types/notes';

// Sticky notes (2026-10-16): small notes that stay on the screen, in the same place, while you're
// in Notes, until removed. Each is an ordinary note in the Stickies notebook (made the first time,
// found by its presetKey), so it syncs, is searchable, can be encrypted and goes to the Recycling
// Bin like any note. Where it sits, and how it's drawn, is per device (store/stickyStore.ts).
// Written as plain text; a sticky whose note was given formatting in the editor is shown read-only
// there, with a way to open it.

export const STICKIES_PRESET = 'stickies';

export function stickiesNotebook(tags: Record<string, NoteTag>): NoteTag | null {
  const found = Object.values(tags).filter((t) => t.kind === 'area' && t.presetKey === STICKIES_PRESET);
  found.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return found[0] ?? null;
}

// The notes shown as stickies, oldest first (so a newer one sits on top).
export function stickyNotes(notes: Record<string, Note>, tags: Record<string, NoteTag>): Note[] {
  const book = stickiesNotebook(tags);
  if (!book) return [];
  return Object.values(notes)
    .filter((n) => n.tagIds.includes(book.id) && !n.archivedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function ensureNotebook(): NoteTagId {
  const have = stickiesNotebook(useNoteStore.getState().noteTags);
  if (have) return have.id;
  return useNoteStore.getState().addNoteTag({ name: LABELS.stickies.notebook, kind: 'area', icon: '🗒️', presetKey: STICKIES_PRESET });
}

// A note's text as plain lines, or null when it holds more than plain paragraphs (formatting,
// headings, blocks), which a sticky can't edit without losing.
export function plainTextOf(json: string): string | null {
  if (!json) return '';
  let doc: { content?: unknown[] };
  try { doc = JSON.parse(json); } catch { return null; }   // unreadable: shown as "open it"
  const lines: string[] = [];
  const blocks = (doc.content ?? []).flatMap((b) => {
    const node = b as { type?: string; content?: unknown[] };
    return node.type === 'section' ? (node.content ?? []) : [node];
  });
  for (const b of blocks) {
    const p = b as { type?: string; attrs?: Record<string, unknown>; content?: { type?: string; text?: string; marks?: unknown[] }[] };
    if (p.type !== 'paragraph') return null;
    let line = '';
    for (const c of p.content ?? []) {
      if (c.type === 'text' && !(c.marks?.length)) line += c.text ?? '';
      else if (c.type === 'hardBreak') line += '\n';
      else return null;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function docForText(text: string): string {
  const paragraphs = text.split('\n').map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }));
  return JSON.stringify({ type: 'doc', content: [{ type: 'section', content: paragraphs }] });
}

const titleFor = (text: string) => text.split('\n').find((l) => l.trim())?.trim().slice(0, 60) || LABELS.stickies.untitled;

export function setStickyText(noteId: string, text: string): void {
  editNoteContent(noteId, null, {
    inEditor: (tr) => {
      const doc = tr.doc.type.schema.nodeFromJSON(JSON.parse(docForText(text)));
      tr.replaceWith(0, tr.doc.content.size, doc.content);
      return true;
    },
    inJson: () => docForText(text),
  });
  const note = useNoteStore.getState().notes[noteId as NoteId];
  const title = titleFor(text);
  if (note && note.title !== title) useNoteStore.getState().updateNote(noteId as NoteId, { title });
}

// A new sticky, a little below and left of the newest one so it doesn't hide it.
export function addSticky(): NoteId {
  const tagId = ensureNotebook();
  const before = stickyNotes(useNoteStore.getState().notes, useNoteStore.getState().noteTags);
  const id = useNoteStore.getState().addNote({ title: LABELS.stickies.untitled, tagIds: [tagId], content: docForText('') });
  const last = before.length ? useStickyStore.getState().places[before[before.length - 1].id] : undefined;
  const step = 0.04;
  useStickyStore.getState().setPlace(id, last
    ? { x: Math.max(0.02, last.x - step), y: Math.min(0.8, last.y + step * 1.5), design: last.design }
    : DEFAULT_STICKY_PLACE);
  return id;
}

// Takes it off the screen: the note is deleted (to the Recycling Bin), with Undo.
export function removeSticky(noteId: NoteId): void {
  const note = useNoteStore.getState().notes[noteId];
  if (!note) return;
  if (useUIStore.getState().editingNoteId === noteId) useUIStore.getState().closeNote();
  const trashed = trashedBy(() => deleteNoteWithCleanup(noteId));
  showToast({
    message: LABELS.stickies.removed,
    actions: [{ label: LABELS.swipeActions.undo, onClick: () => restoreAllFromTrash(trashed) }],
  });
}
