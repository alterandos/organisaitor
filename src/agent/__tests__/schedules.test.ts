import { beforeEach, describe, expect, it } from 'vitest';
import { read } from '@/agent/access';
import { addDays, fails, ok, resetStores, run } from '@/test/helpers';

beforeEach(resetStores);

// A Monday, so weekday arithmetic in the assertions is easy to follow.
const MON = '2031-03-10';
const block = (over: Record<string, unknown> = {}) => ({ title: 'Maths', daysOfWeek: [1, 3], startTime: '09:00', endTime: '10:00', ...over });
const create = (over: Record<string, unknown> = {}) =>
  ok('create_schedule', { name: 'Term 1', startDate: MON, endDate: addDays(MON, 27), blocks: [block()], ...over }, { approved: true });

describe('create_schedule', () => {
  it('needs approval, then creates the schedule and its blocks in one go', () => {
    const input = { name: 'Term 1', blocks: [block()] };
    expect(run('create_schedule', input).status).toBe('needs_approval');
    const { created } = create();
    const s = read.schedule(created.id)!;
    expect(s).toMatchObject({ name: 'Term 1', active: true, startDate: MON, endDate: addDays(MON, 27) });
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]).toMatchObject({
      title: 'Maths', daysOfWeek: [1, 3], interval: 1, intervalAnchor: MON, exceptions: [], requiresCommitment: false, committedDates: [],
    });
    expect(s.blocks[0].id).toHaveLength(8);
  });

  it('sorts and de-duplicates the days', () => {
    const { created } = create({ blocks: [block({ daysOfWeek: [5, 1, 5, 3] })] });
    expect(read.schedule(created.id)!.blocks[0].daysOfWeek).toEqual([1, 3, 5]);
  });

  it('rejects a block that ends before it starts, and dates out of order', () => {
    expect(fails('create_schedule', { name: 'x', blocks: [block({ startTime: '10:00', endTime: '09:00' })] }, { approved: true }).message).toMatch(/must be after/);
    expect(fails('create_schedule', { name: 'x', startDate: MON, endDate: addDays(MON, -1), blocks: [block()] }, { approved: true }).message).toMatch(/before startDate/);
    expect(read.schedules()).toHaveLength(0);
  });

  it('reports overlaps with other switched-on schedules', () => {
    create();
    const second = create({ name: 'Gym', blocks: [block({ title: 'Spin', startTime: '09:30', endTime: '10:30', daysOfWeek: [1] })] });
    expect(second.potentialConflictsWithOtherSchedules).toBe(1);
  });
});

describe('update_schedule', () => {
  it('renames, switches off and recolours without touching the blocks', () => {
    const { created } = create();
    ok('update_schedule', { id: created.id, name: 'Term 1 (final)', active: false, color: '#ff0000' });
    expect(read.schedule(created.id)).toMatchObject({ name: 'Term 1 (final)', active: false, color: '#ff0000' });
    expect(read.schedule(created.id)!.blocks).toHaveLength(1);
  });

  it('adds up to three blocks without asking, and edits a block by id', () => {
    const { created } = create();
    ok('update_schedule', { id: created.id, addBlocks: [block({ title: 'Physics', daysOfWeek: [2], startTime: '11:00', endTime: '12:00' })] });
    const s = read.schedule(created.id)!;
    expect(s.blocks.map((b) => b.title)).toEqual(['Maths', 'Physics']);
    ok('update_schedule', { id: created.id, updateBlocks: [{ id: s.blocks[0].id, startTime: '08:00', location: 'Hall 2' }] });
    expect(read.schedule(created.id)!.blocks[0]).toMatchObject({ startTime: '08:00', endTime: '10:00', location: 'Hall 2' });
  });

  it('asks for approval before removing blocks, or adding many', () => {
    const { created } = create();
    const id = read.schedule(created.id)!.blocks[0].id;
    expect(run('update_schedule', { id: created.id, removeBlocks: [id] }).status).toBe('needs_approval');
    expect(read.schedule(created.id)!.blocks).toHaveLength(1);
    expect(run('update_schedule', { id: created.id, addBlocks: [block(), block(), block(), block()] }).status).toBe('needs_approval');
    ok('update_schedule', { id: created.id, removeBlocks: [id] }, { approved: true });
    expect(read.schedule(created.id)!.blocks).toHaveLength(0);
  });

  it('refuses an unknown block, an empty update, and a resulting bad time', () => {
    const { created } = create();
    expect(fails('update_schedule', { id: created.id, updateBlocks: [{ id: 'ghost', title: 'x' }] }).code).toBe('not_found');
    expect(fails('update_schedule', { id: created.id }).message).toMatch(/Nothing to change/);
    const id = read.schedule(created.id)!.blocks[0].id;
    expect(fails('update_schedule', { id: created.id, updateBlocks: [{ id, startTime: '11:00' }] }).message).toMatch(/must be after/);
    expect(read.schedule(created.id)!.blocks[0].startTime).toBe('09:00');
  });

  it('keeps skipped and committed dates when a block is edited', () => {
    const { created } = create({ blocks: [block({ requiresCommitment: true })] });
    const id = read.schedule(created.id)!.blocks[0].id;
    ok('manage_schedule_occurrences', { scheduleId: created.id, blockId: id, action: 'skip', dates: [MON] });
    ok('manage_schedule_occurrences', { scheduleId: created.id, blockId: id, action: 'commit', dates: [addDays(MON, 2)] });
    ok('update_schedule', { id: created.id, updateBlocks: [{ id, title: 'Maths 101' }] });
    expect(read.schedule(created.id)!.blocks[0]).toMatchObject({ title: 'Maths 101', exceptions: [MON], committedDates: [addDays(MON, 2)] });
  });
});

describe('manage_schedule_occurrences', () => {
  it('skips and un-skips dates', () => {
    const { created } = create();
    const blockId = read.schedule(created.id)!.blocks[0].id;
    ok('manage_schedule_occurrences', { scheduleId: created.id, blockId, action: 'skip', dates: [MON, addDays(MON, 7)] });
    expect(read.schedule(created.id)!.blocks[0].exceptions).toEqual([MON, addDays(MON, 7)]);
    ok('manage_schedule_occurrences', { scheduleId: created.id, blockId, action: 'unskip', dates: [MON] });
    expect(read.schedule(created.id)!.blocks[0].exceptions).toEqual([addDays(MON, 7)]);
  });

  it('only commits on a block that uses commitment mode', () => {
    const { created } = create();
    const blockId = read.schedule(created.id)!.blocks[0].id;
    expect(fails('manage_schedule_occurrences', { scheduleId: created.id, blockId, action: 'commit', dates: [MON] }).message).toMatch(/commitment mode/);
  });

  it('commits and uncommits', () => {
    const { created } = create({ blocks: [block({ title: 'Spin', requiresCommitment: true })] });
    const blockId = read.schedule(created.id)!.blocks[0].id;
    ok('manage_schedule_occurrences', { scheduleId: created.id, blockId, action: 'commit', dates: [MON, addDays(MON, 7)] });
    ok('manage_schedule_occurrences', { scheduleId: created.id, blockId, action: 'uncommit', dates: [MON] });
    expect(read.schedule(created.id)!.blocks[0].committedDates).toEqual([addDays(MON, 7)]);
  });
});

describe('previews and conflicts', () => {
  it('previews an existing schedule honouring skips and its end date', () => {
    const { created } = create({ endDate: addDays(MON, 13) });
    const blockId = read.schedule(created.id)!.blocks[0].id;
    ok('manage_schedule_occurrences', { scheduleId: created.id, blockId, action: 'skip', dates: [addDays(MON, 7)] });
    const out = ok('preview_schedule', { scheduleId: created.id, from: MON, to: addDays(MON, 27) });
    expect(out.blocks[0].dates).toEqual([MON, addDays(MON, 2), addDays(MON, 9)]);
  });

  it('previews proposed every-other-week blocks without saving them', () => {
    const out = ok('preview_schedule', { blocks: [block({ daysOfWeek: [1], interval: 2 })], startDate: MON, from: MON, to: addDays(MON, 27) });
    expect(out.blocks[0].dates).toEqual([MON, addDays(MON, 14)]);
    expect(read.schedules()).toHaveLength(0);
  });

  it('wants a schedule id or blocks, not both', () => {
    expect(fails('preview_schedule', {}).code).toBe('invalid_input');
  });

  it('finds conflicts for proposed blocks and can ignore one schedule', () => {
    const { created } = create();
    const out = ok('find_schedule_conflicts', { blocks: [{ title: 'Yoga', daysOfWeek: [1], startTime: '09:30', endTime: '10:30' }] });
    expect(out.conflictCount).toBe(1);
    expect(out.conflicts[0].schedule.id).toBe(created.id);
    expect(ok('find_schedule_conflicts', { blocks: [{ daysOfWeek: [1], startTime: '09:30', endTime: '10:30' }], excludeScheduleId: created.id }).conflictCount).toBe(0);
    expect(ok('find_schedule_conflicts', { blocks: [{ daysOfWeek: [2], startTime: '09:30', endTime: '10:30' }] }).conflictCount).toBe(0);
  });

  it('does not count a switched-off schedule', () => {
    const { created } = create();
    ok('update_schedule', { id: created.id, active: false });
    expect(ok('find_schedule_conflicts', { blocks: [{ daysOfWeek: [1], startTime: '09:30', endTime: '10:30' }] }).conflictCount).toBe(0);
  });
});
