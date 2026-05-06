import type { CollectionId, Milestone, Task, TaskId } from '@/types';

/**
 * Derives milestones for a collection from its associated tasks.
 * Only top-level tasks (no parentId) with a deadline are included.
 * Results are sorted chronologically.
 */
export function computeMilestones(
  collectionId: CollectionId,
  tasks: Record<TaskId, Task>,
): Milestone[] {
  return Object.values(tasks)
    .filter(
      (t) =>
        t.collectionId === collectionId &&
        t.deadline !== null &&
        !t.parentId &&
        !t.completed,
    )
    .map((t) => ({
      id:     `milestone-task-${t.id}`,
      source: 'task' as const,
      taskId: t.id,
      date:   t.deadline!,
      title:  `Complete "${t.title}"`,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
