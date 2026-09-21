import { beforeEach, describe, expect, it } from 'vitest';
import { read } from '@/agent/access';
import { addDays, fails, ok, resetStores } from '@/test/helpers';

beforeEach(resetStores);

const MON = '2031-03-10';

describe('get_context', () => {
  it('gives today, the timezone and the ids to file things under', () => {
    ok('create_endeavour', { name: 'Thesis', kind: 'project' });
    const archived = ok('create_endeavour', { name: 'Old', kind: 'list' }).created;
    ok('archive_item', { type: 'endeavour', id: archived.id });
    ok('create_purpose', { name: 'Health' });
    ok('create_tag', { name: 'urgent' });
    const ctx = ok('get_context', {});
    expect(ctx.today).toBe(read.today());
    expect(ctx.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']).toContain(ctx.weekday);
    expect(ctx.endeavours.map((e: { name: string }) => e.name)).toEqual(['Thesis']);
    expect(ctx.purposes).toHaveLength(1);
    expect(ctx.tags).toHaveLength(1);
    expect(ctx.glossary.join(' ')).toMatch(/cannot delete/);
  });
});

describe('search', () => {
  beforeEach(() => {
    ok('create_task', { title: 'Write the quarterly report', notes: 'for finance' });
    ok('create_task', { title: 'Book dentist' });
    ok('create_calendar_item', { kind: 'event', title: 'Report review meeting', date: MON, location: 'Boardroom' });
    ok('create_calendar_item', { kind: 'reminder', title: 'Dentist follow-up', date: MON });
    ok('create_schedule', { name: 'Gym timetable', blocks: [{ title: 'Spin class', daysOfWeek: [2], startTime: '18:00', endTime: '19:00' }] }, { approved: true });
  });

  it('needs every word, across title, notes and location', () => {
    expect(ok('search', { query: 'report' }).total).toBe(2);
    expect(ok('search', { query: 'report finance' }).total).toBe(1);
    expect(ok('search', { query: 'boardroom' }).total).toBe(1);
    expect(ok('search', { query: 'nothing here' }).total).toBe(0);
  });

  it('finds a schedule by one of its block titles', () => {
    expect(ok('search', { query: 'spin' }).results[0]).toMatchObject({ type: 'schedule', name: 'Gym timetable' });
  });

  it('can be limited to a kind, and ranks title matches first', () => {
    expect(ok('search', { query: 'dentist', types: ['task'] }).total).toBe(1);
    const out = ok('search', { query: 'report' });
    expect(out.results[0].title).toMatch(/report/i);
  });

  it('hides archived items unless asked', () => {
    const id = read.tasks().find((t) => t.title === 'Book dentist')!.id;
    ok('archive_item', { type: 'task', id });
    expect(ok('search', { query: 'dentist', types: ['task'] }).total).toBe(0);
    expect(ok('search', { query: 'dentist', types: ['task'], includeArchived: true }).total).toBe(1);
  });

  it('does not list the calendar entries that belong to a task twice', () => {
    ok('create_task', { title: 'Uniquename task', deadline: MON, scheduledAt: MON });
    expect(ok('search', { query: 'uniquename' }).results.filter((r: { title: string }) => r.title === 'Uniquename task').length).toBe(2);
    expect(ok('search', { query: 'uniquename', types: ['task'] }).total).toBe(1);
  });
});

describe('list_tasks', () => {
  it('defaults to open top-level tasks, sorted by deadline', () => {
    const { created: a } = ok('create_task', { title: 'Later', deadline: addDays(MON, 5) });
    ok('create_task', { title: 'Sooner', deadline: MON });
    ok('create_task', { title: 'No date' });
    ok('create_task', { title: 'Sub', parentId: a.id });
    const done = ok('create_task', { title: 'Finished' }).created;
    ok('set_task_status', { id: done.id, done: true });
    const out = ok('list_tasks', {});
    expect(out.tasks.map((t: { title: string }) => t.title)).toEqual(['Sooner', 'Later', 'No date']);
    expect(out.total).toBe(3);
    expect(out.tasks[1].subtasks).toBe(1);
  });

  it('filters by status, Endeavour, priority, dates and text', () => {
    const { created: proj } = ok('create_endeavour', { name: 'P', kind: 'project' });
    ok('create_task', { title: 'In project', endeavourId: proj.id, priority: 'high', deadline: MON });
    ok('create_task', { title: 'Elsewhere', deadline: addDays(MON, 10) });
    const done = ok('create_task', { title: 'Done one' }).created;
    ok('set_task_status', { id: done.id, done: true });
    expect(ok('list_tasks', { endeavourId: proj.id }).total).toBe(1);
    expect(ok('list_tasks', { priority: 'high' }).total).toBe(1);
    expect(ok('list_tasks', { dueFrom: addDays(MON, 5) }).tasks[0].title).toBe('Elsewhere');
    expect(ok('list_tasks', { status: 'done' }).total).toBe(1);
    expect(ok('list_tasks', { status: 'all' }).total).toBe(3);
    expect(ok('list_tasks', { text: 'project' }).total).toBe(1);
  });

  it('pages through results', () => {
    for (let i = 0; i < 5; i++) ok('create_task', { title: `T${i}` });
    const page = ok('list_tasks', { limit: 2, offset: 2 });
    expect(page).toMatchObject({ total: 5, offset: 2 });
    expect(page.tasks).toHaveLength(2);
  });

  it('lists the sub-tasks of a task', () => {
    const { created } = ok('create_task', { title: 'Parent' });
    ok('create_task', { title: 'Child', parentId: created.id });
    expect(ok('list_tasks', { parentId: created.id }).tasks[0].title).toBe('Child');
  });
});

describe('get', () => {
  it('gives the detail of a task, an event, a reminder, a schedule and an Endeavour', () => {
    const { created: proj } = ok('create_endeavour', { name: 'P', kind: 'project' });
    const { created: task } = ok('create_task', { title: 'A', notes: 'n', endeavourId: proj.id, deadline: MON });
    const { created: sub } = ok('create_task', { title: 'B', parentId: task.id });
    const { created: ev } = ok('create_calendar_item', { kind: 'event', title: 'E', date: MON, notes: 'x' });
    const { created: rem } = ok('create_calendar_item', { kind: 'reminder', title: 'R', date: MON });
    const { created: sch } = ok('create_schedule', { name: 'S', blocks: [{ title: 'b', daysOfWeek: [1], startTime: '09:00', endTime: '10:00' }] }, { approved: true });
    expect(ok('get', { type: 'task', id: task.id })).toMatchObject({ title: 'A', notes: 'n', subtaskList: [{ id: sub.id }] });
    expect(ok('get', { type: 'calendar_item', id: ev.id })).toMatchObject({ kind: 'event', notes: 'x' });
    expect(ok('get', { type: 'calendar_item', id: rem.id })).toMatchObject({ kind: 'reminder' });
    expect(ok('get', { type: 'schedule', id: sch.id }).blocks).toHaveLength(1);
    expect(ok('get', { type: 'endeavour', id: proj.id })).toMatchObject({ name: 'P', openTasks: 2 });
  });

  it('says clearly when something is not there', () => {
    expect(fails('get', { type: 'task', id: 'nope' }).code).toBe('not_found');
    expect(fails('get', { type: 'endeavour', id: 'nope' }).code).toBe('not_found');
  });
});

describe('get_calendar_range', () => {
  it('shows deadlines, scheduled tasks, events and reminders in order', () => {
    ok('create_calendar_item', { kind: 'event', title: 'Lunch', date: MON, startTime: '12:00', endTime: '13:00' });
    ok('create_calendar_item', { kind: 'reminder', title: 'Call', date: MON, time: '08:00' });
    ok('create_task', { title: 'Report', deadline: MON, deadlineTime: '17:00', scheduledAt: MON, scheduledTime: '09:00' });
    const out = ok('get_calendar_range', { from: MON, to: MON });
    expect(out.items.map((i: { kind: string; title: string }) => `${i.kind}:${i.title}`)).toEqual([
      'reminder:Call', 'task_scheduled:Report', 'event:Lunch', 'task_deadline:Report',
    ]);
  });

  it('does not show the reminder that only exists to carry a task deadline', () => {
    ok('create_task', { title: 'Report', deadline: MON });
    const out = ok('get_calendar_range', { from: MON, to: MON });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].kind).toBe('task_deadline');
  });

  it('expands repeats into occurrences and drops skipped dates', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'Standup', date: MON, startTime: '09:00', endTime: '09:15', repeat: { freq: 'daily', endKind: 'count', count: 5 } });
    ok('edit_occurrence', { id: created.id, date: addDays(MON, 2), action: 'skip' });
    const out = ok('get_calendar_range', { from: MON, to: addDays(MON, 6) });
    expect(out.items.map((i: { date: string }) => i.date)).toEqual([MON, addDays(MON, 1), addDays(MON, 3), addDays(MON, 4)]);
  });

  it('includes a multi-day event on every day it overlaps the range', () => {
    ok('create_calendar_item', { kind: 'event', title: 'Conference', date: MON, endDate: addDays(MON, 2) });
    expect(ok('get_calendar_range', { from: addDays(MON, 1), to: addDays(MON, 1) }).items).toHaveLength(1);
    expect(ok('get_calendar_range', { from: addDays(MON, 3), to: addDays(MON, 4) }).items).toHaveLength(0);
  });

  it('includes blocks of switched-on schedules only, with commitment state', () => {
    const { created } = ok('create_schedule', { name: 'Gym', startDate: MON, blocks: [{ title: 'Spin', daysOfWeek: [1], startTime: '18:00', endTime: '19:00', requiresCommitment: true }] }, { approved: true });
    const blockId = read.schedule(created.id)!.blocks[0].id;
    ok('manage_schedule_occurrences', { scheduleId: created.id, blockId, action: 'commit', dates: [MON] });
    const week = ok('get_calendar_range', { from: MON, to: addDays(MON, 7) });
    expect(week.items.map((i: { date: string; committed: boolean | undefined }) => [i.date, i.committed ?? false])).toEqual([[MON, true], [addDays(MON, 7), false]]);
    ok('update_schedule', { id: created.id, active: false });
    expect(ok('get_calendar_range', { from: MON, to: addDays(MON, 7) }).items).toHaveLength(0);
  });

  it('hides archived items and can be scoped to an Endeavour', () => {
    const { created: proj } = ok('create_endeavour', { name: 'P', kind: 'project' });
    const { created: a } = ok('create_calendar_item', { kind: 'event', title: 'In P', date: MON, endeavourId: proj.id });
    ok('create_calendar_item', { kind: 'event', title: 'Elsewhere', date: MON });
    expect(ok('get_calendar_range', { from: MON, to: MON, endeavourId: proj.id }).items).toHaveLength(1);
    ok('archive_item', { type: 'calendar_item', id: a.id });
    expect(ok('get_calendar_range', { from: MON, to: MON }).items).toHaveLength(1);
  });

  it('refuses a backwards or very long range, and caps the number returned', () => {
    expect(fails('get_calendar_range', { from: MON, to: addDays(MON, -1) }).code).toBe('invalid_input');
    expect(fails('get_calendar_range', { from: MON, to: addDays(MON, 200) }).code).toBe('invalid');
    for (let i = 0; i < 4; i++) ok('create_calendar_item', { kind: 'reminder', title: `R${i}`, date: MON });
    const out = ok('get_calendar_range', { from: MON, to: MON, limit: 3 });
    expect(out).toMatchObject({ total: 4, truncated: true });
    expect(out.items).toHaveLength(3);
  });
});

describe('list_schedules', () => {
  it('lists schedules with their blocks and can hide the switched-off ones', () => {
    const { created } = ok('create_schedule', { name: 'A', blocks: [{ title: 'b', daysOfWeek: [1], startTime: '09:00', endTime: '10:00' }] }, { approved: true });
    ok('create_schedule', { name: 'B', blocks: [{ title: 'c', daysOfWeek: [2], startTime: '09:00', endTime: '10:00' }] }, { approved: true });
    ok('update_schedule', { id: created.id, active: false });
    expect(ok('list_schedules', {}).schedules).toHaveLength(2);
    expect(ok('list_schedules', { includeInactive: false }).schedules.map((s: { name: string }) => s.name)).toEqual(['B']);
  });
});

describe('reads never change anything', () => {
  it('leaves the stores untouched and creates no undo batch', () => {
    ok('create_task', { title: 'A', deadline: MON });
    const before = JSON.stringify([read.tasks(), read.events(), read.reminders(), read.schedules()]);
    for (const [name, input] of [
      ['get_context', {}], ['search', { query: 'a' }], ['list_tasks', {}], ['list_schedules', {}],
      ['get_calendar_range', { from: MON, to: MON }], ['find_schedule_conflicts', { blocks: [{ daysOfWeek: [1], startTime: '09:00', endTime: '10:00' }] }],
    ] as const) ok(name, input);
    expect(JSON.stringify([read.tasks(), read.events(), read.reminders(), read.schedules()])).toBe(before);
  });
});
