import type { Task, CreateTaskInput } from '@/types';
import { newTaskId } from '@/utils/id';
import { now } from '@/utils/date';

export function createTask(input: CreateTaskInput, sortOrder: number): Task {
  const ts = now();
  return {
    id:           newTaskId(),
    createdAt:    ts,
    updatedAt:    ts,
    title:        input.title.trim(),
    notes:        input.notes  ?? null,
    links:        input.links  ?? [],
    completed:    false,
    completedAt:  null,
    collectionId: input.collectionId ?? null,
    tagIds:       input.tagIds       ?? [],
    purposeIds:   input.purposeIds   ?? [],
    priority:     input.priority     ?? 'none',
    deadline:     input.deadline     ?? null,
    deadlineTime: input.deadlineTime ?? null,
    remindAt:     null,
    archived:     false,
    kind:          input.kind          ?? 'action',
    timeIntensity: input.timeIntensity ?? null,
    parentId:      input.parentId      ?? null,
    subtaskIds:   [],
    sortOrder,
  };
}
