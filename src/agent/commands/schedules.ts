import { z } from 'zod';
import { defineCommand, type ApprovalPolicy } from '@/agent/types';
import { read, write } from '@/agent/access';
import { AgentError } from '@/agent/errors';
import { countTemplateConflicts } from '@/utils/scheduleOccurrences';
import { createScheduleBlock } from '@/utils/scheduleBlocks';
import type { ScheduleBlock, ScheduleTemplate } from '@/types';
import { assertBlockTimes, dateStr, daysOfWeek, idStr, requireEndeavour, requireSchedule, scheduleSummary, timeStr, uniqueSorted } from './shared';

const newBlock = z.object({
  title: z.string().trim().min(1).max(200),
  daysOfWeek,
  startTime: timeStr,
  endTime: timeStr,
  location: z.string().trim().max(300).nullish(),
  interval: z.number().int().min(1).max(52).default(1).describe('Repeat every N weeks; 1 = every week'),
  intervalAnchor: dateStr.optional().describe('For every-N-weeks blocks (and for a block that starts later than the schedule): the date of the first occurrence\'s week. Defaults to the schedule start date, else today'),
  requiresCommitment: z.boolean().optional().describe('For sessions the user chooses week by week whether to attend (a gym class); each occurrence then shows as uncommitted until committed'),
  notes: z.string().max(2000).nullish(),
});

type NewBlock = z.output<typeof newBlock>;

function buildBlock(b: NewBlock, fallbackAnchor: string): ScheduleBlock {
  assertBlockTimes(b);
  return createScheduleBlock({
    title: b.title, daysOfWeek: uniqueSorted(b.daysOfWeek), startTime: b.startTime, endTime: b.endTime,
    location: b.location, interval: b.interval, intervalAnchor: b.intervalAnchor ?? fallbackAnchor,
    notes: b.notes, requiresCommitment: b.requiresCommitment,
  });
}

function conflictCount(schedule: ScheduleTemplate): number {
  return countTemplateConflicts(schedule, read.schedules().filter((s) => s.active && s.id !== schedule.id));
}

function assertDateOrder(start: string | null | undefined, end: string | null | undefined) {
  if (start && end && end < start) throw new AgentError('invalid', 'endDate is before startDate.');
}

export const createSchedule = defineCommand({
  name: 'create_schedule',
  description:
    'Create a recurring weekly Schedule (a timetable layer such as a semester of classes or a gym timetable) with its blocks. ' +
    'Call list_schedules first: if a schedule for the same thing already exists, use update_schedule instead. Use find_schedule_conflicts ' +
    'to check overlap. Because this adds a lot at once, the user is asked to approve it before it happens.',
  tier: 'create',
  approval: 'review',
  input: z.object({
    name: z.string().trim().min(1).max(200),
    color: z.string().trim().max(20).nullish().describe('Hex colour like #4f46e5'),
    startDate: dateStr.nullish().describe('First day the schedule applies (for example the start of term)'),
    endDate: dateStr.nullish().describe('Last day the schedule applies'),
    endeavourId: idStr.nullish(),
    blocks: z.array(newBlock).min(1).max(60),
  }),
  describe: (i) => `Create schedule "${i.name}" with ${i.blocks.length} block${i.blocks.length === 1 ? '' : 's'}`,
  run: (input, ctx) => {
    assertDateOrder(input.startDate, input.endDate);
    if (input.endeavourId) requireEndeavour(input.endeavourId);
    const anchor = input.startDate ?? read.today();
    const id = write.createSchedule({
      name: input.name,
      color: input.color ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      collectionId: (input.endeavourId ?? null) as never,
      blocks: input.blocks.map((b) => buildBlock(b, anchor)),
    });
    ctx.seen('schedule', id);
    const schedule = requireSchedule(id);
    return { created: scheduleSummary(schedule), potentialConflictsWithOtherSchedules: conflictCount(schedule) };
  },
});

export const updateSchedule = defineCommand({
  name: 'update_schedule',
  description:
    'Change an existing Schedule: rename it, change its dates or colour, switch it on or off (active), add blocks, edit blocks by id, or remove blocks. ' +
    'Use this rather than creating a second schedule for the same thing (for example a new term of the same timetable). ' +
    'Removing blocks, or adding many, asks the user to approve first.',
  tier: 'modify',
  approval: (input: { removeBlocks?: string[]; addBlocks?: unknown[] }): ApprovalPolicy =>
    (input.removeBlocks?.length ?? 0) > 0 || (input.addBlocks?.length ?? 0) > 3 ? 'review' : 'auto',
  input: z.object({
    id: idStr,
    name: z.string().trim().min(1).max(200).optional(),
    color: z.string().trim().max(20).nullish(),
    startDate: dateStr.nullish(),
    endDate: dateStr.nullish(),
    active: z.boolean().optional().describe('Switch the schedule on or off on the calendar'),
    endeavourId: idStr.nullish(),
    addBlocks: z.array(newBlock).max(60).optional(),
    updateBlocks: z.array(z.object({
      id: idStr,
      title: z.string().trim().min(1).max(200).optional(),
      daysOfWeek: daysOfWeek.optional(),
      startTime: timeStr.optional(),
      endTime: timeStr.optional(),
      location: z.string().trim().max(300).nullish(),
      interval: z.number().int().min(1).max(52).optional(),
      intervalAnchor: dateStr.optional(),
      requiresCommitment: z.boolean().optional(),
      notes: z.string().max(2000).nullish(),
    })).max(60).optional(),
    removeBlocks: z.array(idStr).max(60).optional().describe('Block ids to remove'),
  }),
  describe: (i) => {
    const bits = [
      i.addBlocks?.length ? `add ${i.addBlocks.length} block(s)` : null,
      i.updateBlocks?.length ? `edit ${i.updateBlocks.length} block(s)` : null,
      i.removeBlocks?.length ? `remove ${i.removeBlocks.length} block(s)` : null,
    ].filter(Boolean);
    return `Update schedule ${i.id}${bits.length ? `: ${bits.join(', ')}` : ''}`;
  },
  run: (input, ctx) => {
    const schedule = requireSchedule(input.id);
    const startDate = input.startDate === undefined ? schedule.startDate : input.startDate;
    const endDate = input.endDate === undefined ? schedule.endDate : input.endDate;
    assertDateOrder(startDate, endDate);
    if (input.endeavourId) requireEndeavour(input.endeavourId);

    let blocks = schedule.blocks;
    for (const id of [...(input.removeBlocks ?? []), ...(input.updateBlocks ?? []).map((u) => u.id)]) {
      if (!blocks.some((b) => b.id === id)) throw new AgentError('not_found', `Schedule "${schedule.name}" has no block with id "${id}".`);
    }
    if (input.removeBlocks?.length) blocks = blocks.filter((b) => !input.removeBlocks?.includes(b.id));
    if (input.updateBlocks?.length) {
      blocks = blocks.map((b) => {
        const u = input.updateBlocks?.find((x) => x.id === b.id);
        if (!u) return b;
        const next: ScheduleBlock = {
          ...b,
          title: u.title ?? b.title,
          daysOfWeek: u.daysOfWeek ? uniqueSorted(u.daysOfWeek) : b.daysOfWeek,
          startTime: u.startTime ?? b.startTime,
          endTime: u.endTime ?? b.endTime,
          location: u.location === undefined ? b.location : (u.location || null),
          interval: u.interval ?? b.interval,
          intervalAnchor: u.intervalAnchor ?? b.intervalAnchor,
          requiresCommitment: u.requiresCommitment ?? b.requiresCommitment,
          notes: u.notes === undefined ? b.notes : (u.notes || null),
        };
        assertBlockTimes(next);
        return next;
      });
    }
    if (input.addBlocks?.length) blocks = [...blocks, ...input.addBlocks.map((b) => buildBlock(b, startDate ?? read.today()))];

    const changes: Partial<Omit<ScheduleTemplate, 'id' | 'createdAt'>> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.color !== undefined) changes.color = input.color ?? null;
    if (input.startDate !== undefined) changes.startDate = input.startDate ?? null;
    if (input.endDate !== undefined) changes.endDate = input.endDate ?? null;
    if (input.active !== undefined) changes.active = input.active;
    if (input.endeavourId !== undefined) changes.collectionId = (input.endeavourId ?? null) as never;
    if (blocks !== schedule.blocks) changes.blocks = blocks;
    if (Object.keys(changes).length === 0) throw new AgentError('invalid', 'Nothing to change: pass at least one field besides id.');

    write.updateSchedule(schedule.id, changes);
    ctx.seen('schedule', schedule.id);
    const updated = requireSchedule(schedule.id);
    return { updated: scheduleSummary(updated), potentialConflictsWithOtherSchedules: conflictCount(updated) };
  },
});

export const manageScheduleOccurrences = defineCommand({
  name: 'manage_schedule_occurrences',
  description:
    'Act on individual dates of a schedule block. "skip" cancels a date (a holiday, a cancelled class); "unskip" puts it back. ' +
    '"commit" / "uncommit" say whether the user is attending a date, for blocks created with requiresCommitment. Dates must be real occurrences (check preview_schedule).',
  tier: 'modify',
  approval: 'auto',
  input: z.object({
    scheduleId: idStr,
    blockId: idStr,
    action: z.enum(['skip', 'unskip', 'commit', 'uncommit']),
    dates: z.array(dateStr).min(1).max(60),
  }),
  run: (input, ctx) => {
    const schedule = requireSchedule(input.scheduleId);
    const block = schedule.blocks.find((b) => b.id === input.blockId);
    if (!block) throw new AgentError('not_found', `Schedule "${schedule.name}" has no block with id "${input.blockId}".`);
    if ((input.action === 'commit' || input.action === 'uncommit') && !block.requiresCommitment) {
      throw new AgentError('invalid', `Block "${block.title}" does not use commitment mode, so there is nothing to commit to.`);
    }
    const dates = [...new Set(input.dates)];
    if (input.action === 'commit') write.commitOccurrences(schedule.id, block.id, dates);
    else for (const d of dates) {
      if (input.action === 'skip') write.addException(schedule.id, block.id, d);
      else if (input.action === 'unskip') write.removeException(schedule.id, block.id, d);
      else write.uncommitOccurrence(schedule.id, block.id, d);
    }
    ctx.seen('schedule', schedule.id);
    return { schedule: scheduleSummary(requireSchedule(schedule.id)), applied: input.action, dates };
  },
});

export const SCHEDULE_COMMANDS = [createSchedule, updateSchedule, manageScheduleOccurrences];
