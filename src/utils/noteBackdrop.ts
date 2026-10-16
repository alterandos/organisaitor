import type { NoteBackdropChoice, NoteTag, NoteTagId } from '@/types/notes';
import type { NoteBackdrop } from '@/config/noteBackdrops';

// Which backdrop fills the room below a note (agreed with the user 2026-10-17): the note's own,
// else its notebook's, else each notebook above that, else the app-wide setting. Pure: the
// pictures themselves are read through services/pictures.ts.

export type ShownBackdrop = NoteBackdropChoice | { kind: 'image'; src: string };
export type BackdropFrom = { kind: 'note' } | { kind: 'notebook'; id: NoteTagId } | { kind: 'app' };

const appChoice = (b: NoteBackdrop): ShownBackdrop => b ?? { kind: 'plain' };

// The notebook a note's backdrop comes from: its first notebook (kind 'area').
export function noteNotebookId(note: { tagIds: readonly string[] }, noteTags: Record<string, NoteTag>): NoteTagId | null {
  for (const id of note.tagIds) if (noteTags[id]?.kind === 'area') return id as NoteTagId;
  return null;
}

// What a notebook passes down: its own, else its parents' (cycle-safe).
export function notebookBackdrop(
  tagId: string | null, noteTags: Record<string, NoteTag>,
): { backdrop: NoteBackdropChoice; from: NoteTagId } | null {
  const seen = new Set<string>();
  for (let t = tagId ? noteTags[tagId] : undefined; t && !seen.has(t.id); t = t.parentTagId ? noteTags[t.parentTagId] : undefined) {
    seen.add(t.id);
    if (t.backdrop) return { backdrop: t.backdrop, from: t.id };
  }
  return null;
}

export function resolveNoteBackdrop(
  note: { backdrop?: NoteBackdropChoice | null; tagIds: readonly string[] } | null,
  noteTags: Record<string, NoteTag>,
  appWide: NoteBackdrop,
): { backdrop: ShownBackdrop; from: BackdropFrom } {
  if (note?.backdrop) return { backdrop: note.backdrop, from: { kind: 'note' } };
  const nb = note ? notebookBackdrop(noteNotebookId(note, noteTags), noteTags) : null;
  if (nb) return { backdrop: nb.backdrop, from: { kind: 'notebook', id: nb.from } };
  return { backdrop: appChoice(appWide), from: { kind: 'app' } };
}

// What a notebook's own choice would fall back to: its parent's, else the app-wide setting.
export function resolveNotebookFallback(tag: NoteTag, noteTags: Record<string, NoteTag>, appWide: NoteBackdrop): ShownBackdrop {
  return notebookBackdrop(tag.parentTagId, noteTags)?.backdrop ?? appChoice(appWide);
}

export function backdropPictureId(b: ShownBackdrop | NoteBackdrop | null | undefined): string | null {
  return b && b.kind === 'picture' ? b.pictureId : null;
}
