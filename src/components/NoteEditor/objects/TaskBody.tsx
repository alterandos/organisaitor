import { useTaskStore } from '@/store/taskStore';
import { updateTaskLinked } from '@/services/taskCalendarLinks';
import type { Task, TaskId } from '@/types';
import { ObjectBody } from './ObjectBody';
import { taskFlags } from './flags';
import type { ArtifactBodyProps } from './artifactTypes';

// A task's expanded body in a note: its notes, links, Endeavour and the options that are off,
// saved straight to the task (through updateTaskLinked, so its calendar entries follow), the way
// an event's or reminder's body edits the calendar item. Its deadline is in the heading.
export function TaskBody({ id, heading, onToggle }: ArtifactBodyProps) {
  const task = useTaskStore((s) => s.tasks[id as TaskId]);
  if (!task) return null;
  const update = (changes: Partial<Task>) => updateTaskLinked(id as TaskId, changes);
  return (
    <ObjectBody
      heading={heading}
      onToggle={onToggle}
      notes={task.notes}
      links={task.links}
      collectionId={task.collectionId}
      onNotes={(notes) => update({ notes })}
      onLinks={(links) => update({ links })}
      onCollection={(collectionId) => update({ collectionId })}
      flags={taskFlags(task, update)}
    />
  );
}
