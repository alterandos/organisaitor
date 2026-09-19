import type { Task, CreateTaskInput } from '@/types';
import { newTaskId } from '@/utils/id';
import { now } from '@/utils/date';
import { mergeNewLinks } from '@/utils/links';

export function createTask(input: CreateTaskInput, sortOrder: number): Task {
  const ts = now();
  return {
    id:           newTaskId(),
    createdAt:    ts,
    updatedAt:    ts,
    title:        input.title.trim(),
    notes:        input.notes  ?? null,
    links:        mergeNewLinks(input.links ?? [], input.notes),
    completed:    false,
    completedAt:  null,
    collectionId: input.collectionId ?? null,
    tagIds:       input.tagIds       ?? [],
    purposeIds:   input.purposeIds   ?? [],
    priority:        input.priority        ?? 'none',
    deadline:        input.deadline        ?? null,
    deadlineTime:    input.deadlineTime    ?? null,
    scheduledAt:     input.scheduledAt     ?? null,
    scheduledTime:   input.scheduledTime   ?? null,
    calendarEventId: input.calendarEventId ?? null,
    calendarReminderId: input.calendarReminderId ?? null,
    remindAt:        null,
    archived:     false,
    archivedAt:    null,
    archiveReason: null,
    kind:         input.kind          ?? 'action',
    timeIntensity: input.timeIntensity ?? null,
    parentId:      input.parentId      ?? null,
    subtaskIds:   [],
    sortOrder,
    crossAppRefs: input.crossAppRefs ?? [],
  };
}
