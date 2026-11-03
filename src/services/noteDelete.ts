import { useUIStore } from '@/store/uiStore';
import { deleteNoteWithCleanup } from '@/services/crossAppLinkCleanup';
import { askAboutOrphans, entriesOnlyIn } from '@/services/glossaryOrphans';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import type { NoteId } from '@/types';

// Deleting a note from the UI (the notes list, the phone's note sheet): asked as any delete is,
// then, if it was the only note holding some Glossary records, whether they go from the Glossary
// too (services/glossaryOrphans.ts, agreed with the user 2026-11-03). Cancelling either keeps the
// note. Resolves whether it was deleted.
export async function deleteNoteAsked(noteId: string, name: string, { empty }: { empty: boolean }): Promise<boolean> {
  if (!(await confirmDelete('note', name, undefined, { empty }))) return false;
  const only = entriesOnlyIn(noteId);
  const answer = await askAboutOrphans(only, 'note');
  if (answer === 'cancel') return false;
  if (useUIStore.getState().editingNoteId === noteId) useUIStore.getState().closeNote();
  deleteNoteWithCleanup(noteId as NoteId, { deleteEntries: answer === 'delete' ? only : [] });
  return true;
}
