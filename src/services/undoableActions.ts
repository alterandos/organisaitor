import { useTaskStore } from '@/store/taskStore';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { trashedBy, restoreAllFromTrash } from '@/services/trash';
import { showToast } from '@/components/Toast/showToast';
import { LABELS } from '@/config/labels';
import type { TaskId } from '@/types';

// Archive / delete straight from a gesture, with an Undo toast instead of a confirm dialog
// (decision D2, docs/android/11-design-and-coding-patterns.md §9). Pane footers keep their
// confirm dialog; these are for swipe-left and action-sheet paths.

export function archiveTaskWithUndo(taskId: TaskId): void {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task || task.archived) return;
  useTaskStore.getState().archiveTask(taskId);
  showToast({
    message: LABELS.swipeActions.archivedToast(task.title),
    actions: [{ label: LABELS.swipeActions.undo, onClick: () => useTaskStore.getState().restoreTask(taskId) }],
  });
}

// The delete goes to the Recycling Bin like any other, so Undo restores from there: every entry
// the delete created (sub-tasks and calendar entries too), leaving the bin as it was.
export function deleteTaskWithUndo(taskId: TaskId): void {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task) return;
  const trashed = trashedBy(() => deleteTaskWithCleanup(taskId));
  showToast({
    message: LABELS.swipeActions.deletedToast(task.title),
    actions: [{ label: LABELS.swipeActions.undo, onClick: () => restoreAllFromTrash(trashed) }],
  });
}
