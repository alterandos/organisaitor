import { useTaskStore } from '@/store/taskStore';
import { choiceDialog, confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { endeavourInUse } from '@/services/inUse';
import { endeavourSubtree } from '@/utils/endeavourGraph';
import { LABELS } from '@/config/labels';
import { now } from '@/utils/date';
import type { Collection, CollectionId } from '@/types';

// Archiving (or restoring) an Endeavour that has parts asks whether they go with it (the user,
// 2026-11-06: ask each time, never silently): "Archive all N" or "Just this one". THE way the UI
// archives or restores an Endeavour (the form, Manage, right-click); one with no parts to change
// doesn't ask. Deleting one asks too (deleteEndeavourAsked), unless nothing uses it.

const L = LABELS.endeavourArchive;

export async function archiveEndeavourAsked(id: CollectionId, archive: boolean): Promise<void> {
  const all = useTaskStore.getState().collections as Record<string, Collection>;
  const c = all[id];
  if (!c) return;
  const parts = [...endeavourSubtree(id, all)]
    .filter((p) => p !== id && (all[p]?.kind === 'project' || all[p]?.kind === 'list') && !!all[p]?.archivedAt !== archive);
  let withParts = false;
  if (parts.length) {
    const r = await choiceDialog({
      title: archive ? L.archiveTitle(c.name) : L.restoreTitle(c.name),
      message: archive ? L.archiveMessage(parts.length) : L.restoreMessage(parts.length),
      confirmLabel: archive ? L.archiveAll(parts.length + 1) : L.restoreAll(parts.length + 1),
      alternateLabel: L.justThis,
    });
    if (r === 'cancel') return;
    withParts = r === 'confirm';
  }
  const at = archive ? now() : null;
  for (const target of [id, ...(withParts ? parts : [])]) useTaskStore.getState().updateCollection(target as CollectionId, { archivedAt: at });
}

// Deletes it after asking (its tasks and items stay, unfiled: the store's deleteCollection). Returns
// whether it was deleted.
export async function deleteEndeavourAsked(id: CollectionId): Promise<boolean> {
  const c = useTaskStore.getState().collections[id];
  if (!c) return false;
  if (!(await confirmDelete(LABELS.collection.toLowerCase(), c.name, L.deleteDetail, { empty: !endeavourInUse(id) }))) return false;
  useTaskStore.getState().deleteCollection(id);
  return true;
}
