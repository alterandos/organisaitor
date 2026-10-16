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
// Written as text with bold, italic, underline and strikethrough (STICKY_MARKS); a sticky whose note
// was given more in the editor is shown read-only there, with a way to open it.

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

// What a sticky can hold: paragraphs of text, line breaks, and bold, italic, underline and
// strikethrough (asked for 2026-10-16). A note holding anything more (a heading, a block, a link,
// a colour) is shown read-only on its sticky, with a way to open it, since the sticky would lose it.
export const STICKY_MARKS = ['bold', 'italic', 'underline', 'strike'] as const;
export type StickyMark = typeof STICKY_MARKS[number];

type StickyInline = { type: 'text'; text: string; marks?: { type: StickyMark }[] } | { type: 'hardBreak' };
export interface StickyDoc { type: 'doc'; content: { type: 'paragraph'; content?: StickyInline[] }[] }

// A document (the note's, or the sticky editor's) as a sticky's content, or null when it holds more.
// Accepts the note's section wrapper; drops nothing it accepts, so saving it back loses nothing.
export function stickyDocFrom(doc: unknown): StickyDoc | null {
  const top = (doc ?? {}) as { content?: unknown[] };
  const blocks = (top.content ?? []).flatMap((b) => {
    const node = b as { type?: string; content?: unknown[] };
    return node.type === 'section' ? (node.content ?? []) : [node];
  });
  const out: StickyDoc = { type: 'doc', content: [] };
  for (const b of blocks) {
    const p = b as { type?: string; content?: { type?: string; text?: string; marks?: { type?: string; attrs?: Record<string, unknown> }[] }[] };
    if (p.type !== 'paragraph') return null;
    const inline: StickyInline[] = [];
    for (const c of p.content ?? []) {
      if (c.type === 'hardBreak') { inline.push({ type: 'hardBreak' }); continue; }
      if (c.type !== 'text') return null;
      const marks: { type: StickyMark }[] = [];
      for (const m of c.marks ?? []) {
        if (!STICKY_MARKS.includes(m.type as StickyMark) || Object.keys(m.attrs ?? {}).length) return null;
        marks.push({ type: m.type as StickyMark });
      }
      inline.push(marks.length ? { type: 'text', text: c.text ?? '', marks } : { type: 'text', text: c.text ?? '' });
    }
    out.content.push(inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' });
  }
  if (out.content.length === 0) out.content.push({ type: 'paragraph' });
  return out;
}

export function stickyDocOf(json: string): StickyDoc | null {
  if (!json) return stickyDocFrom(null);
  try { return stickyDocFrom(JSON.parse(json)); } catch { return null; }   // unreadable: shown as "open it"
}

// The sticky's text, line by line (its title is the first line).
export const stickyText = (doc: StickyDoc): string =>
  doc.content.map((p) => (p.content ?? []).map((c) => (c.type === 'text' ? c.text : '\n')).join('')).join('\n');

const asNoteJson = (doc: StickyDoc) => JSON.stringify({ type: 'doc', content: [{ type: 'section', content: doc.content }] });

export function docForText(text: string): string {
  return asNoteJson({ type: 'doc', content: text.split('\n').map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })) });
}

const titleFor = (text: string) => text.split('\n').find((l) => l.trim())?.trim().slice(0, 60) || LABELS.stickies.untitled;

export function setStickyContent(noteId: string, doc: StickyDoc): void {
  const json = asNoteJson(doc);
  editNoteContent(noteId, null, {
    inEditor: (tr) => {
      const next = tr.doc.type.schema.nodeFromJSON(JSON.parse(json));
      tr.replaceWith(0, tr.doc.content.size, next.content);
      return true;
    },
    inJson: () => json,
  });
  const note = useNoteStore.getState().notes[noteId as NoteId];
  const title = titleFor(stickyText(doc));
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
