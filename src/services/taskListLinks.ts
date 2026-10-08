// A task can link to lists (Task.crossAppRefs entries of type 'list'). When a linked list is a
// checklist, its items act like the task's sub-steps: the task shows them (TaskPane) and their
// progress (TaskItem), ticking works from either side, and — the two rules that live here, so
// every UI path behaves the same — ticking the last item offers to complete the task, and
// completing the task unticks a checklist marked "reusable" (List.resetOnTaskComplete).
// The items themselves are never copied: there is one ListItem, read by both sections.
//
// Lives outside the stores for the same reason taskCalendarLinks does: it needs taskStore and
// listStore. Agents don't go through here — they have no access to lists (see agent/access.ts),
// so an agent completing a task doesn't reset a list: that would be an untracked, un-undoable
// change to data agents are otherwise kept away from (encrypted lists included).
import { useTaskStore } from '@/store/taskStore';
import { spawnNextOccurrence } from '@/services/recurringTasks';
import { useListStore } from '@/store/listStore';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { isListLocked, listView, LOCKED_LIST_NAME } from '@/services/listSecrets';
import { LABELS } from '@/config/labels';
import type { CrossAppRef, Task, TaskId } from '@/types';
import type { List, ListId, ListItem, ListItemId } from '@/types/lists';

export const linkedListIds = (refs: CrossAppRef[] | undefined): ListId[] =>
  (refs ?? []).filter((r) => r.type === 'list').map((r) => r.id as ListId);

export interface ChecklistProgress { done: number; total: number }

// Ticked / total across every linked checklist; null when none of the linked lists is a checklist
// (a linked watchlist or reference list is just a link, with no progress to show).
export function checklistProgress(
  listIds: ListId[],
  lists: Record<string, List>,
  items: Record<string, ListItem>,
): ChecklistProgress | null {
  const checklists = new Set(listIds.filter((id) => lists[id]?.kind === 'checklist'));
  if (checklists.size === 0) return null;
  let done = 0;
  let total = 0;
  for (const item of Object.values(items)) {
    if (!checklists.has(item.listId)) continue;
    total++;
    if (item.status === 'done') done++;
  }
  return { done, total };
}

const listName = (list: List) => (isListLocked(list) ? LOCKED_LIST_NAME : listView(list).name);

// Toggles a task's completion. On completing it, unticks every linked checklist marked reusable.
// Completing a recurring task also creates its next occurrence (services/recurringTasks.ts);
// returns that occurrence's id, if one was made.
export function toggleTaskWithLists(taskId: TaskId): TaskId | null {
  const before = useTaskStore.getState().tasks[taskId];
  if (!before) return null;
  useTaskStore.getState().toggleTask(taskId);
  if (before.completed) return null;
  const next = spawnNextOccurrence(taskId);
  const { lists, uncheckAllListItems } = useListStore.getState();
  for (const id of linkedListIds(before.crossAppRefs)) {
    const list = lists[id];
    if (list?.kind === 'checklist' && list.resetOnTaskComplete) uncheckAllListItems(id);
  }
  return next;
}

// Open (not completed, not archived) tasks that link to a list.
export function openTasksLinkedToList(listId: ListId): Task[] {
  return Object.values(useTaskStore.getState().tasks).filter(
    (t) => !t.completed && !t.archived && linkedListIds(t.crossAppRefs).includes(listId),
  );
}

// Ticks or unticks a checklist item. If that ticked the last open item, asks — once per open task
// linked to the list, and only when ALL of that task's linked checklists are now done — whether to
// complete the task. Declining leaves everything as it is.
export async function toggleChecklistItemWithTasks(itemId: ListItemId): Promise<void> {
  const item = useListStore.getState().listItems[itemId];
  if (!item) return;
  const wasDone = item.status === 'done';
  useListStore.getState().toggleListItemChecked(itemId);
  if (wasDone) return;

  const { lists, listItems } = useListStore.getState();
  const list = lists[item.listId];
  if (list?.kind !== 'checklist') return;

  for (const task of openTasksLinkedToList(item.listId)) {
    const progress = checklistProgress(linkedListIds(task.crossAppRefs), lists, listItems);
    if (!progress || progress.total === 0 || progress.done < progress.total) continue;
    const reset = linkedListIds(task.crossAppRefs).some((id) => lists[id]?.kind === 'checklist' && lists[id]?.resetOnTaskComplete);
    const ok = await confirmDialog({
      title:        LABELS.listLinks.completeTitle(task.title),
      message:      `${LABELS.listLinks.completeMessage(listName(list))}${reset ? ` ${LABELS.listLinks.completeReset}` : ''}`,
      confirmLabel: LABELS.listLinks.completeConfirm,
      cancelLabel:  LABELS.listLinks.completeCancel,
    });
    // Re-checked after the wait: the task may have been completed or deleted meanwhile.
    const current = useTaskStore.getState().tasks[task.id];
    if (ok && current && !current.completed) toggleTaskWithLists(task.id);
  }
}
