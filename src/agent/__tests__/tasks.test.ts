import { beforeEach, describe, expect, it } from 'vitest';
import { read } from '@/agent/access';
import { useTaskStore } from '@/store/taskStore';
import { FAR, addDays, fails, ok, resetStores } from '@/test/helpers';

beforeEach(resetStores);

describe('create_task', () => {
  it('creates a plain task with defaults', () => {
    const { created } = ok('create_task', { title: '  Buy milk  ' });
    expect(created).toMatchObject({ title: 'Buy milk', status: 'open' });
    expect(read.tasks()).toHaveLength(1);
    expect(read.events()).toHaveLength(0);
    expect(read.reminders()).toHaveLength(0);
  });

  it('gives a task with dates its calendar entries', () => {
    const { created } = ok('create_task', { title: 'Report', deadline: FAR, deadlineTime: '17:00', scheduledAt: addDays(FAR, -2), scheduledTime: '09:30' });
    const task = read.task(created.id)!;
    expect(read.events()[0]).toMatchObject({ title: 'Report', date: addDays(FAR, -2), startTime: '09:30', eventType: 'task' });
    expect(read.reminders()[0]).toMatchObject({ title: 'Report', date: FAR, time: '17:00', reminderType: 'task' });
    expect(task.calendarEventId).toBe(read.events()[0].id);
    expect(task.calendarReminderId).toBe(read.reminders()[0].id);
  });

  it('rejects a time without a date', () => {
    expect(fails('create_task', { title: 'x', deadlineTime: '10:00' }).message).toMatch(/deadline date/);
    expect(fails('create_task', { title: 'x', scheduledTime: '10:00' }).message).toMatch(/scheduledAt/);
  });

  it('rejects malformed dates and times before touching anything', () => {
    fails('create_task', { title: 'x', deadline: '10/03/2031' });
    fails('create_task', { title: 'x', deadline: FAR, deadlineTime: '25:00' });
    expect(read.tasks()).toHaveLength(0);
  });

  it('files under an Endeavour, and refuses an unknown or archived one', () => {
    const { created: proj } = ok('create_endeavour', { name: 'Thesis', kind: 'project' });
    const { created } = ok('create_task', { title: 'Chapter 1', endeavourId: proj.id });
    expect(created.endeavour).toEqual({ id: proj.id, name: 'Thesis' });
    expect(fails('create_task', { title: 'x', endeavourId: 'nope' }).code).toBe('not_found');
    ok('archive_item', { type: 'endeavour', id: proj.id });
    expect(fails('create_task', { title: 'x', endeavourId: proj.id }).code).toBe('conflict');
  });

  it('will not file a task under a tracker or routine', () => {
    const tracker = useTaskStore.getState().addCollection({ kind: 'tracker', name: 'Water' });
    const routine = useTaskStore.getState().addCollection({ kind: 'routine', name: 'Morning' });
    expect(fails('create_task', { title: 'x', endeavourId: tracker }).code).toBe('not_found');
    expect(fails('create_task', { title: 'x', endeavourId: routine }).code).toBe('not_found');
    expect(read.tasks()).toHaveLength(0);
  });

  it('makes a sub-task that inherits its parent priority and Endeavour', () => {
    const { created: proj } = ok('create_endeavour', { name: 'Trip', kind: 'list' });
    const { created: parent } = ok('create_task', { title: 'Plan', priority: 'high', endeavourId: proj.id });
    const { created: sub } = ok('create_task', { title: 'Book flights', parentId: parent.id });
    expect(sub).toMatchObject({ priority: 'high', parentId: parent.id, endeavour: { id: proj.id } });
    expect(read.task(parent.id)!.subtaskIds).toEqual([sub.id]);
    const { created: own } = ok('create_task', { title: 'Pack', parentId: parent.id, priority: 'low', endeavourId: null });
    expect(own.priority).toBe('low');
    expect(own.endeavour).toBeUndefined();
  });

  it('does not allow a sub-task of a sub-task', () => {
    const { created: parent } = ok('create_task', { title: 'A' });
    const { created: sub } = ok('create_task', { title: 'B', parentId: parent.id });
    expect(fails('create_task', { title: 'C', parentId: sub.id }).message).toMatch(/Sub-tasks cannot/);
  });

  it('copies a link typed into the notes into the links list', () => {
    const { created } = ok('create_task', { title: 'Read', notes: 'See https://example.com/paper for it' });
    expect(read.task(created.id)!.links).toContain('https://example.com/paper');
  });
});

describe('update_task', () => {
  it('changes only the fields given', () => {
    const { created } = ok('create_task', { title: 'A', priority: 'low', notes: 'keep' });
    ok('update_task', { id: created.id, priority: 'high' });
    expect(read.task(created.id)).toMatchObject({ title: 'A', priority: 'high', notes: 'keep' });
  });

  it('keeps the calendar entries in step and clears them with null', () => {
    const { created } = ok('create_task', { title: 'Slides', deadline: FAR, scheduledAt: FAR, scheduledTime: '10:00' });
    ok('update_task', { id: created.id, title: 'Slides v2', deadline: addDays(FAR, 1), scheduledTime: '11:00' });
    expect(read.events()[0]).toMatchObject({ title: 'Slides v2', startTime: '11:00' });
    expect(read.reminders()[0]).toMatchObject({ title: 'Slides v2', date: addDays(FAR, 1) });
    ok('update_task', { id: created.id, deadline: null, scheduledAt: null });
    expect(read.events()).toHaveLength(0);
    expect(read.reminders()).toHaveLength(0);
    expect(read.task(created.id)).toMatchObject({ deadline: null, deadlineTime: null, scheduledAt: null, scheduledTime: null, calendarEventId: null });
  });

  it('will not add a time without a date', () => {
    const { created } = ok('create_task', { title: 'A' });
    expect(fails('update_task', { id: created.id, deadlineTime: '10:00' }).message).toMatch(/deadline date/);
  });

  it('refuses an empty update, a missing task and an archived one', () => {
    const { created } = ok('create_task', { title: 'A' });
    expect(fails('update_task', { id: created.id }).message).toMatch(/Nothing to change/);
    expect(fails('update_task', { id: 'nope', title: 'x' }).code).toBe('not_found');
    ok('archive_item', { type: 'task', id: created.id });
    expect(fails('update_task', { id: created.id, title: 'x' }).code).toBe('conflict');
  });

  it('replaces purposes and tags, and rejects unknown ones', () => {
    const { created: p } = ok('create_purpose', { name: 'Health' });
    const { created: t } = ok('create_tag', { name: 'urgent' });
    const { created } = ok('create_task', { title: 'Run' });
    ok('update_task', { id: created.id, purposeIds: [p.id], tagIds: [t.id] });
    expect(read.task(created.id)).toMatchObject({ purposeIds: [p.id], tagIds: [t.id] });
    expect(fails('update_task', { id: created.id, tagIds: ['ghost'] }).code).toBe('not_found');
  });
});

describe('set_task_status', () => {
  it('completes and reopens', () => {
    const { created } = ok('create_task', { title: 'A' });
    ok('set_task_status', { id: created.id, done: true });
    expect(read.task(created.id)).toMatchObject({ completed: true });
    expect(read.task(created.id)!.completedAt).not.toBeNull();
    ok('set_task_status', { id: created.id, done: false });
    expect(read.task(created.id)).toMatchObject({ completed: false, completedAt: null });
  });

  it('is idempotent', () => {
    const { created } = ok('create_task', { title: 'A' });
    ok('set_task_status', { id: created.id, done: true });
    const stamp = read.task(created.id)!.completedAt;
    ok('set_task_status', { id: created.id, done: true });
    expect(read.task(created.id)!.completedAt).toBe(stamp);
  });
});

describe('archive_item / restore_item', () => {
  it('archives a task with its sub-tasks and restores them together', () => {
    const { created: parent } = ok('create_task', { title: 'Parent' });
    const { created: sub } = ok('create_task', { title: 'Child', parentId: parent.id });
    ok('archive_item', { type: 'task', id: parent.id, reason: 'done with it' });
    expect(read.task(parent.id)).toMatchObject({ archived: true, archiveReason: 'done with it' });
    expect(read.task(sub.id)!.archived).toBe(true);
    ok('restore_item', { type: 'task', id: parent.id });
    expect(read.task(parent.id)!.archived).toBe(false);
    expect(read.task(sub.id)!.archived).toBe(false);
  });

  it('reports "unchanged" rather than failing when already in that state', () => {
    const { created } = ok('create_task', { title: 'A' });
    expect(ok('restore_item', { type: 'task', id: created.id })).toEqual({ unchanged: true });
  });

  it('archives and restores an Endeavour and a Purpose', () => {
    const { created: e } = ok('create_endeavour', { name: 'Old project', kind: 'project' });
    const { created: p } = ok('create_purpose', { name: 'Old purpose' });
    ok('archive_item', { type: 'endeavour', id: e.id });
    ok('archive_item', { type: 'purpose', id: p.id });
    expect(read.endeavour(e.id)!.archivedAt).not.toBeNull();
    expect(read.purpose(p.id)!.archivedAt).not.toBeNull();
    ok('restore_item', { type: 'endeavour', id: e.id });
    expect(read.endeavour(e.id)!.archivedAt).toBeNull();
  });

  it('archives nothing else on the way: the task stays in the store', () => {
    const { created } = ok('create_task', { title: 'A' });
    ok('archive_item', { type: 'task', id: created.id });
    expect(read.tasks()).toHaveLength(1);
  });
});

describe('create_endeavour / create_purpose / create_tag', () => {
  it('refuses a duplicate name and points at the existing one', () => {
    const { created } = ok('create_endeavour', { name: 'Work', kind: 'list' });
    const e = fails('create_endeavour', { name: ' work ', kind: 'project' });
    expect(e.code).toBe('conflict');
    expect(e.message).toContain(created.id);
    ok('create_purpose', { name: 'Health' });
    expect(fails('create_purpose', { name: 'HEALTH' }).code).toBe('conflict');
    ok('create_tag', { name: 'x' });
    expect(fails('create_tag', { name: 'X' }).code).toBe('conflict');
  });

  it('allows a name again once the old one is archived', () => {
    const { created } = ok('create_endeavour', { name: 'Work', kind: 'list' });
    ok('archive_item', { type: 'endeavour', id: created.id });
    ok('create_endeavour', { name: 'Work', kind: 'list' });
  });

  it('only gives a project a deadline', () => {
    expect(fails('create_endeavour', { name: 'L', kind: 'list', deadline: FAR }).message).toMatch(/project/);
    ok('create_endeavour', { name: 'P', kind: 'project', deadline: FAR });
  });
});
