// THE way the UI completes or reopens a task. Wraps toggleTaskWithLists (linked checklists) with
// the task-link rules:
//   - completing a task that's still waiting on others asks first: complete it anyway, or complete
//     everything it's waiting on too (the whole chain upstream) so nothing is left to tidy up;
//   - completing shows a toast — what was unlocked, "+ Follow-up" (a new task that came out of this
//     one) and "Undo".
// Reopening just reopens. Agents don't come through here (agent/access.ts toggles directly, with no
// dialog or toast); an agent completing a blocked task is simply allowed.
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { toggleTaskWithLists } from '@/services/taskListLinks';
import { discardOccurrence, skipOccurrence, skipTarget } from '@/services/recurringTasks';
import { formatDate } from '@/utils/date';
import { choiceDialog } from '@/components/ConfirmDialog/dialogs';
import { showToast } from '@/components/Toast/showToast';
import { openBlockers, openBlockersDeep, unlockedBy } from '@/utils/taskLinks';
import { LABELS } from '@/config/labels';
import type { CollectionId, TaskId } from '@/types';
import type { HoverOption } from '@/components/HoverOptions/HoverOptions';

const L = LABELS.taskLinks;

export interface CompletionOptions {
  // Complete everything this task is waiting on too, without asking (the prompt's "Complete all").
  withBlockers?: boolean;
  // Open a new follow-up task (AddTaskModal, linked back) straight after completing.
  thenFollowUp?: boolean;
}

// What hovering a task's Complete button offers besides a plain click (TaskItem's checkbox, the
// pane footers) — so a follow-up or "complete the chain" can be chosen up front, not only from the
// toast afterwards. Empty for a completed or archived task (its button just reopens).
export function taskCompletionOptions(taskId: TaskId): HoverOption[] {
  const tasks = useTaskStore.getState().tasks;
  const task = tasks[taskId];
  if (!task || task.completed || task.archived) return [];
  const upstream = openBlockersDeep(task, tasks).length;
  return [
    { label: L.menu.completeWithFollowUp, onClick: () => void toggleTaskCompletion(taskId, { thenFollowUp: true }) },
    ...(upstream > 0 ? [{ label: L.menu.completeWithBlockers(upstream), onClick: () => void toggleTaskCompletion(taskId, { withBlockers: true }) }] : []),
    { label: L.menu.followUpOnly, onClick: () => useUIStore.getState().showAddFollowUp(taskId) },
    ...skipOption(taskId),
  ];
}

// "Skip this one" for a repeating task, when the rule has a next date; [] otherwise.
export function skipOption(taskId: TaskId): HoverOption[] {
  const when = skipTarget(taskId);
  return when ? [{ label: LABELS.recurring.skip(formatDate(when)), onClick: () => skipOccurrenceWithUndo(taskId) }] : [];
}

export function skipOccurrenceWithUndo(taskId: TaskId): void {
  const task = useTaskStore.getState().tasks[taskId];
  const undo = skipOccurrence(taskId);
  const moved = useTaskStore.getState().tasks[taskId];
  if (!task || !undo || !moved) return;
  const when = moved.deadline ?? moved.scheduledAt;
  showToast({
    message: LABELS.recurring.toastSkipped(task.title, when ? formatDate(when) : ''),
    actions: [{ label: L.toastUndo, onClick: undo }],
  });
}

export async function toggleTaskCompletion(taskId: TaskId, opts: CompletionOptions = {}): Promise<void> {
  const tasks = useTaskStore.getState().tasks;
  const task = tasks[taskId];
  if (!task) return;
  if (task.completed) { toggleTaskWithLists(taskId); return; }

  let upstream: TaskId[] = [];
  const direct = openBlockers(task, tasks);
  if (direct.length > 0 && opts.withBlockers) {
    upstream = openBlockersDeep(task, tasks).map((t) => t.id).reverse();
  } else if (direct.length > 0) {
    const deep = openBlockersDeep(task, tasks);
    const choice = await choiceDialog({
      title:          L.completeBlockedTitle(task.title),
      message:        L.completeBlockedMessage(direct.map((t) => t.title)),
      confirmLabel:   L.completeAnyway,
      alternateLabel: L.completeAll(deep.length),
    });
    if (choice === 'cancel') return;
    // Furthest upstream first, so each completion happens in the order the chain would have.
    if (choice === 'alternate') upstream = deep.map((t) => t.id).reverse();
  }

  const completed: TaskId[] = [];
  const spawned: TaskId[] = [];
  for (const id of [...upstream, taskId]) {
    const t = useTaskStore.getState().tasks[id];
    if (!t || t.completed) continue;
    const next = toggleTaskWithLists(id);
    completed.push(id);
    if (next) spawned.push(next);
  }
  if (!completed.includes(taskId)) return;

  const after = useTaskStore.getState().tasks;
  const unlocked = [...new Map(completed.flatMap((id) => unlockedBy(id, after)).map((t) => [t.id, t])).values()];
  // The project's last open task: offer to archive the project (a project has no "completed"
  // state of its own; archiving is how it's finished, decided 2026-10-14).
  const project = task.collectionId ? useTaskStore.getState().collections[task.collectionId] : undefined;
  const projectDone = !!project && project.kind === 'project' && !project.archivedAt
    && Object.values(after).every((t) => t.collectionId !== project.id || t.completed || t.archived);
  if (opts.thenFollowUp) useUIStore.getState().showAddFollowUp(taskId);
  showToast({
    message: L.toastCompleted(task.title) + (completed.length > 1 ? ` (+${completed.length - 1})` : ''),
    detail:  [
      projectDone ? L.toastProjectDone(project.name) : null,
      unlocked.length > 0 ? L.toastUnlocked(unlocked.map((t) => t.title)) : null,
      ...spawned.map((id) => { const n = after[id]; const when = n?.deadline ?? n?.scheduledAt; return when ? LABELS.recurring.toastNext(formatDate(when)) : null; }),
    ].filter(Boolean).join(' · ') || undefined,
    actions: [
      ...(projectDone ? [{ label: L.toastArchiveProject, onClick: () => archiveProjectWithUndo(project.id) }] : []),
      ...(opts.thenFollowUp ? [] : [{ label: L.toastFollowUp, onClick: () => useUIStore.getState().showAddFollowUp(taskId) }]),
      {
        label: L.toastUndo,
        onClick: () => {
          for (const id of completed) {
            if (useTaskStore.getState().tasks[id]?.completed) useTaskStore.getState().toggleTask(id);
          }
          // The next occurrence a recurring task's completion made goes again.
          for (const id of spawned) discardOccurrence(id);
        },
      },
    ],
  });
}

function archiveProjectWithUndo(id: CollectionId): void {
  const project = useTaskStore.getState().collections[id];
  if (!project || project.archivedAt) return;
  useTaskStore.getState().updateCollection(id, { archivedAt: new Date().toISOString() });
  showToast({
    message: L.toastProjectArchived(project.name),
    actions: [{ label: L.toastUndo, onClick: () => useTaskStore.getState().updateCollection(id, { archivedAt: null }) }],
  });
}
