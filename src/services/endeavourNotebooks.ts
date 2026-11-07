import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { parentNotebook } from '@/services/endeavourTemplates';
import { parentsOf } from '@/utils/endeavourGraph';
import { isPinnedNotebook } from '@/utils/notes';
import { LABELS } from '@/config/labels';
import type { CollectionId, NoteTagId } from '@/types';

// An Endeavour's notebooks follow its place among the Endeavours by default (a subject's inside its
// semester's), but notebooks can skip a level or stand on their own, so moving an Endeavour asks
// (the user, 2026-11-06) rather than moving them: "Move its notebook into “Semester 2”?" (or to the
// top level, when it's no longer part of anything with a notebook). Nothing to move, nothing asked.

const L = LABELS.endeavourNotebooks;

export async function askToMoveNotebooks(id: CollectionId): Promise<boolean> {
  const all = useTaskStore.getState().collections;
  const c = all[id];
  if (!c) return false;
  const target = parentNotebook(parentsOf(c, all)[0] ?? null);
  const noteTags = useNoteStore.getState().noteTags;
  // Its own notebooks not already in the place they'd be made in now (a notebook inside another of
  // its own stays where it is).
  const own = Object.values(noteTags).filter((t) => t.kind === 'area' && t.collectionId === id && !isPinnedNotebook(t));
  const ownIds = new Set(own.map((t) => t.id));
  const toMove = own.filter((t) => (t.parentTagId ?? null) !== target && !(t.parentTagId && ownIds.has(t.parentTagId)) && t.id !== target);
  if (!toMove.length) return false;
  const where = target ? noteTags[target]?.name ?? '' : null;
  const what = toMove.length === 1 ? L.one(toMove[0].name) : L.many(toMove.length);
  const ok = await confirmDialog({
    title: where ? L.title(what, where) : L.titleTop(what),
    message: L.message,
    confirmLabel: L.move,
  });
  if (!ok) return false;
  for (const t of toMove) useNoteStore.getState().updateNoteTag(t.id as NoteTagId, { parentTagId: target });
  return true;
}
