import { useNoteStore } from '@/store/noteStore';
import type { CrossAppRef, NoteTagId } from '@/types';
import type { NoteId } from '@/types/notes';
import { formatDate } from '@/utils/date';

// Where a new note goes: inside a notebook (null: outside any), or as a new tab of an existing note.
export type NotePlace = { kind: 'notebook'; id: string | null } | { kind: 'note'; id: string };

// A new note made from an item (a calendar event, reminder or deadline): in a notebook (a new
// note), or in an existing note (a new tab). Returns the link to put on the item's crossAppRefs —
// the same kind of link as picking an existing note, so the note's "Linked from" bar shows the
// item and the item's chip opens the note (on the new tab).
export function createNoteForItem(place: NotePlace, title: string): CrossAppRef {
  const store = useNoteStore.getState();
  if (place.kind === 'note') {
    const tabId = store.addNoteTab(place.id as NoteId, title);
    return { type: 'note', id: place.id, tabId };
  }
  const id = store.addNote({ title, tagIds: place.id ? [place.id as NoteTagId] : [] });
  return { type: 'note', id };
}

// A new note's (or tab's) name from a dated item: its title and its date, so a weekly lecture's
// notes can be told apart.
export function newNoteTitleFor(title: string, date: string | null | undefined): string {
  const t = title.trim();
  return date ? `${t} · ${formatDate(`${date}T00:00:00`)}` : t;
}
