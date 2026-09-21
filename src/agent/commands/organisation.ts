import { z } from 'zod';
import { defineCommand } from '@/agent/types';
import { read, write } from '@/agent/access';
import { AgentError } from '@/agent/errors';
import { dateStr, endeavourSummary, idStr, requireCalendarItem, requireIds, requireTask, taskSummary } from './shared';

const name = z.string().trim().min(1).max(100);
const color = z.string().trim().max(20).nullish().describe('Hex colour like #4f46e5');

function assertNoDuplicate(kind: string, wanted: string, existing: { id: string; name: string }[]) {
  const dupe = existing.find((e) => e.name.trim().toLowerCase() === wanted.trim().toLowerCase());
  if (dupe) throw new AgentError('conflict', `A ${kind} named "${dupe.name}" already exists (id ${dupe.id}). Use that one.`);
}

export const createEndeavour = defineCommand({
  name: 'create_endeavour',
  description: 'Create an Endeavour: a project (has an end, may have a deadline) or a list (ongoing) that tasks and calendar items are filed under. Check get_context first: it may already exist.',
  tier: 'create',
  approval: 'auto',
  input: z.object({
    name,
    kind: z.enum(['project', 'list']),
    description: z.string().max(2000).nullish(),
    color,
    deadline: dateStr.nullish().describe('Projects only'),
    purposeIds: z.array(idStr).max(20).optional(),
  }),
  run: (input, ctx) => {
    assertNoDuplicate('Endeavour', input.name, read.endeavours().filter((c) => !c.archivedAt));
    if (input.purposeIds) requireIds('purpose', input.purposeIds);
    if (input.deadline && input.kind !== 'project') throw new AgentError('invalid', 'Only a project has a deadline.');
    const id = write.createEndeavour({
      kind: input.kind, name: input.name, description: input.description ?? null, color: input.color ?? null,
      deadline: input.deadline ?? null, purposeIds: input.purposeIds as never,
    });
    ctx.seen('endeavour', id);
    return { created: endeavourSummary(read.endeavour(id) as NonNullable<ReturnType<typeof read.endeavour>>) };
  },
});

export const createPurpose = defineCommand({
  name: 'create_purpose',
  description: 'Create a Purpose: a broad area of life or work ("Health", "Career") used to group items across the app. Check get_context first: it may already exist.',
  tier: 'create',
  approval: 'auto',
  input: z.object({ name, description: z.string().max(2000).nullish(), color }),
  run: (input, ctx) => {
    assertNoDuplicate('Purpose', input.name, read.purposes().filter((p) => !p.archivedAt));
    const id = write.createPurpose({ name: input.name, description: input.description ?? null, color: input.color ?? null });
    ctx.seen('purpose', id);
    return { created: { id, name: input.name.trim() } };
  },
});

export const createTag = defineCommand({
  name: 'create_tag',
  description: 'Create a Tag: a small free-form label for tasks. Check get_context first: it may already exist.',
  tier: 'create',
  approval: 'auto',
  input: z.object({ name, color, notes: z.string().max(2000).nullish() }),
  run: (input, ctx) => {
    assertNoDuplicate('Tag', input.name, read.tags());
    const id = write.createTag({ name: input.name, color: input.color ?? null, notes: input.notes ?? null });
    ctx.seen('tag', id);
    return { created: { id, name: input.name.trim() } };
  },
});

// ── archive / restore ────────────────────────────────────────────────────────────────────────

const ARCHIVABLE = z.enum(['task', 'calendar_item', 'endeavour', 'purpose']);

export const archiveItem = defineCommand({
  name: 'archive_item',
  description:
    'Archive a task, calendar item, Endeavour or Purpose. This is how anything is removed: archived items are hidden but the user can restore them. ' +
    'Archiving a task also archives its sub-tasks. Items that belong to a task follow the task: archive the task instead.',
  tier: 'archive',
  approval: 'auto',
  input: z.object({ type: ARCHIVABLE, id: idStr, reason: z.string().trim().max(500).optional().describe('Why, shown to the user later') }),
  run: (input, ctx) => setArchived(input.type, input.id, true, input.reason, ctx.seen),
});

export const restoreItem = defineCommand({
  name: 'restore_item',
  description: 'Bring an archived task, calendar item, Endeavour or Purpose back. Restoring a task also restores the sub-tasks archived with it.',
  tier: 'archive',
  approval: 'auto',
  input: z.object({ type: ARCHIVABLE, id: idStr }),
  run: (input, ctx) => setArchived(input.type, input.id, false, undefined, ctx.seen),
});

function setArchived(
  type: z.infer<typeof ARCHIVABLE>, id: string, archive: boolean, reason: string | undefined,
  seen: (kind: 'task' | 'event' | 'reminder' | 'endeavour' | 'purpose', id: string) => void,
) {
  const now = new Date().toISOString();
  if (type === 'task') {
    const task = requireTask(id);
    if (task.archived === archive) return { unchanged: true };
    if (archive) write.archiveTask(id, reason); else write.restoreTask(id);
    seen('task', id);
    return { task: taskSummary(requireTask(id)) };
  }
  if (type === 'calendar_item') {
    const ref = requireCalendarItem(id);
    if (ref.kind === 'event' ? ref.item.eventType === 'task' : ref.item.reminderType === 'task') {
      throw new AgentError('refused', 'This item belongs to a task. Archive or restore the task instead.');
    }
    if (!!ref.item.archivedAt === archive) return { unchanged: true };
    if (ref.kind === 'event') { if (archive) write.archiveEvent(id, reason); else write.restoreEvent(id); }
    else if (archive) write.archiveReminder(id, reason); else write.restoreReminder(id);
    seen(ref.kind, id);
    return { id, archived: archive };
  }
  if (type === 'endeavour') {
    const c = read.endeavour(id);
    if (!c) throw new AgentError('not_found', `No Endeavour with id "${id}". Call get_context for the list.`);
    if (!!c.archivedAt === archive) return { unchanged: true };
    write.updateEndeavour(id, { archivedAt: archive ? now : null });
    seen('endeavour', id);
    return { id, archived: archive };
  }
  const p = read.purpose(id);
  if (!p) throw new AgentError('not_found', `No Purpose with id "${id}". Call get_context for the list.`);
  if (!!p.archivedAt === archive) return { unchanged: true };
  write.updatePurpose(id, { archivedAt: archive ? now : null });
  seen('purpose', id);
  return { id, archived: archive };
}

export const ORGANISATION_COMMANDS = [createEndeavour, createPurpose, createTag, archiveItem, restoreItem];
