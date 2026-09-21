import { z } from 'zod';
import { defineCommand } from '@/agent/types';
import { read, write } from '@/agent/access';
import { AgentError } from '@/agent/errors';
import type { Task } from '@/types';
import { dateStr, idStr, requireActiveTask, requireEndeavour, requireIds, requireTask, taskSummary, timeStr } from './shared';

const priority = z.enum(['none', 'low', 'medium', 'high']);
const kind = z.enum(['action', 'waiting', 'milestone']).describe('action = something to do; waiting = waiting on someone else; milestone = a marker date');
const intensity = z.enum(['low', 'medium', 'high']).describe('Rough effort');

const DEADLINE_HELP = 'When it is due. Shows on the calendar.';
const SCHEDULED_HELP = 'The day the user plans to work on it (different from the deadline). Shows on the calendar as an event.';

function checkDatePairs(deadline: string | null | undefined, deadlineTime: string | null | undefined, scheduledAt: string | null | undefined, scheduledTime: string | null | undefined) {
  if (deadlineTime && !deadline) throw new AgentError('invalid', 'deadlineTime needs a deadline date.');
  if (scheduledTime && !scheduledAt) throw new AgentError('invalid', 'scheduledTime needs a scheduledAt date.');
}

export const createTask = defineCommand({
  name: 'create_task',
  description:
    'Create a task, or a sub-task when parentId is given. A sub-task starts on its parent\'s priority and Endeavour unless you set them. ' +
    'Search first so you do not duplicate an existing task. Do not put a date only in the title: use deadline or scheduledAt so it shows on the calendar.',
  tier: 'create',
  approval: 'auto',
  input: z.object({
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(10_000).optional(),
    priority: priority.optional(),
    kind: kind.optional(),
    timeIntensity: intensity.nullish(),
    endeavourId: idStr.nullish().describe('Id from get_context; null for none'),
    purposeIds: z.array(idStr).max(20).optional(),
    tagIds: z.array(idStr).max(20).optional(),
    parentId: idStr.optional().describe('Make this a sub-task of that top-level task'),
    deadline: dateStr.optional().describe(DEADLINE_HELP),
    deadlineTime: timeStr.optional(),
    scheduledAt: dateStr.optional().describe(SCHEDULED_HELP),
    scheduledTime: timeStr.optional(),
    links: z.array(z.url()).max(20).optional(),
  }),
  run: (input, ctx) => {
    checkDatePairs(input.deadline, input.deadlineTime, input.scheduledAt, input.scheduledTime);
    if (input.endeavourId) requireEndeavour(input.endeavourId);
    if (input.purposeIds) requireIds('purpose', input.purposeIds);
    if (input.tagIds) requireIds('tag', input.tagIds);
    if (input.parentId) {
      const parent = requireActiveTask(input.parentId);
      if (parent.parentId) throw new AgentError('invalid', 'Sub-tasks cannot have sub-tasks. Use the top-level task as the parent.');
    }
    const id = write.createTask({
      title: input.title,
      notes: input.notes ?? null,
      priority: input.priority,
      kind: input.kind,
      timeIntensity: input.timeIntensity ?? null,
      collectionId: input.endeavourId === undefined ? undefined : (input.endeavourId as never),
      purposeIds: input.purposeIds as never,
      tagIds: input.tagIds as never,
      parentId: input.parentId as never,
      deadline: input.deadline ?? null,
      deadlineTime: input.deadlineTime ?? null,
      scheduledAt: input.scheduledAt ?? null,
      scheduledTime: input.scheduledTime ?? null,
      links: input.links,
    });
    ctx.seen('task', id);
    const task = read.task(id);
    return { created: task ? taskSummary(task) : { id } };
  },
});

export const updateTask = defineCommand({
  name: 'update_task',
  description:
    'Change fields of an existing task. Only the fields you pass change; pass null to clear a nullable field (a deadline, a scheduled date, ' +
    'the Endeavour). Changing dates or the title keeps the task\'s calendar entries in step automatically. To mark it done use set_task_status.',
  tier: 'modify',
  approval: 'auto',
  input: z.object({
    id: idStr,
    title: z.string().trim().min(1).max(300).optional(),
    notes: z.string().max(10_000).nullish(),
    priority: priority.optional(),
    kind: kind.optional(),
    timeIntensity: intensity.nullish(),
    endeavourId: idStr.nullish(),
    purposeIds: z.array(idStr).max(20).optional().describe('Replaces the whole list'),
    tagIds: z.array(idStr).max(20).optional().describe('Replaces the whole list'),
    deadline: dateStr.nullish().describe(DEADLINE_HELP),
    deadlineTime: timeStr.nullish(),
    scheduledAt: dateStr.nullish().describe(SCHEDULED_HELP),
    scheduledTime: timeStr.nullish(),
    links: z.array(z.url()).max(20).optional().describe('Replaces the whole list'),
  }),
  run: (input, ctx) => {
    const task = requireActiveTask(input.id);
    const finalDeadline = input.deadline === undefined ? task.deadline : input.deadline;
    const finalScheduled = input.scheduledAt === undefined ? task.scheduledAt : input.scheduledAt;
    const finalDeadlineTime = input.deadline === null ? null : input.deadlineTime === undefined ? task.deadlineTime : input.deadlineTime;
    const finalScheduledTime = input.scheduledAt === null ? null : input.scheduledTime === undefined ? task.scheduledTime : input.scheduledTime;
    checkDatePairs(finalDeadline, finalDeadlineTime, finalScheduled, finalScheduledTime);
    if (input.endeavourId) requireEndeavour(input.endeavourId);
    if (input.purposeIds) requireIds('purpose', input.purposeIds);
    if (input.tagIds) requireIds('tag', input.tagIds);

    const changes: Partial<Omit<Task, 'id' | 'createdAt'>> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.notes !== undefined) changes.notes = input.notes;
    if (input.priority !== undefined) changes.priority = input.priority;
    if (input.kind !== undefined) changes.kind = input.kind;
    if (input.timeIntensity !== undefined) changes.timeIntensity = input.timeIntensity;
    if (input.endeavourId !== undefined) changes.collectionId = input.endeavourId as never;
    if (input.purposeIds !== undefined) changes.purposeIds = input.purposeIds as never;
    if (input.tagIds !== undefined) changes.tagIds = input.tagIds as never;
    if (input.links !== undefined) changes.links = input.links;
    if (input.deadline !== undefined) { changes.deadline = input.deadline; if (input.deadline === null) changes.deadlineTime = null; }
    if (input.deadlineTime !== undefined && input.deadline !== null) changes.deadlineTime = input.deadlineTime;
    if (input.scheduledAt !== undefined) { changes.scheduledAt = input.scheduledAt; if (input.scheduledAt === null) changes.scheduledTime = null; }
    if (input.scheduledTime !== undefined && input.scheduledAt !== null) changes.scheduledTime = input.scheduledTime;

    if (Object.keys(changes).length === 0) throw new AgentError('invalid', 'Nothing to change: pass at least one field besides id.');
    write.updateTask(task.id, changes);
    ctx.seen('task', task.id);
    return { updated: taskSummary(requireTask(task.id)) };
  },
});

export const setTaskStatus = defineCommand({
  name: 'set_task_status',
  description: 'Mark a task done, or reopen it. Only affects that task, not its sub-tasks.',
  tier: 'modify',
  approval: 'auto',
  input: z.object({ id: idStr, done: z.boolean() }),
  run: (input, ctx) => {
    const task = requireActiveTask(input.id);
    if (task.completed !== input.done) write.toggleTask(task.id);
    ctx.seen('task', task.id);
    return { task: taskSummary(requireTask(task.id)) };
  },
});

export const TASK_COMMANDS = [createTask, updateTask, setTaskStatus];
