import { beforeEach, describe, expect, it } from 'vitest';
import { read } from '@/agent/access';
import { FAR, addDays, fails, ok, resetStores } from '@/test/helpers';

beforeEach(resetStores);

describe('create_calendar_item: events', () => {
  it('creates a timed event with location and notification', () => {
    const { created } = ok('create_calendar_item', {
      kind: 'event', title: 'Dentist', date: FAR, startTime: '14:00', endTime: '15:00', location: 'Main St',
      notifyBefore: { value: 30, unit: 'minutes' },
    });
    expect(created).toMatchObject({ kind: 'event', title: 'Dentist', startTime: '14:00', endTime: '15:00', location: 'Main St' });
    expect(read.event(created.id)).toMatchObject({ notifyBeforeValue: 30, notifyBeforeUnit: 'minutes', status: 'confirmed' });
  });

  it('leaves notify-before off unless asked (it is opt-in)', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'A', date: FAR });
    expect(read.event(created.id)!.notifyBeforeValue).toBeNull();
  });

  it('marks a tentative event', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'Maybe', date: FAR, tentative: true, important: true });
    expect(read.event(created.id)).toMatchObject({ status: 'tentative', important: true });
  });

  it('only keeps an end date that is after the start date', () => {
    const { created: same } = ok('create_calendar_item', { kind: 'event', title: 'A', date: FAR, endDate: FAR });
    expect(read.event(same.id)!.endDate).toBeNull();
    const { created: multi } = ok('create_calendar_item', { kind: 'event', title: 'Trip', date: FAR, endDate: addDays(FAR, 3) });
    expect(read.event(multi.id)!.endDate).toBe(addDays(FAR, 3));
    expect(fails('create_calendar_item', { kind: 'event', title: 'B', date: FAR, endDate: addDays(FAR, -1) }).message).toMatch(/endDate is before/);
  });

  it('rejects an end time that is not after the start on the same day', () => {
    expect(fails('create_calendar_item', { kind: 'event', title: 'A', date: FAR, startTime: '15:00', endTime: '14:00' }).message).toMatch(/not after start/);
    ok('create_calendar_item', { kind: 'event', title: 'Overnight', date: FAR, endDate: addDays(FAR, 1), startTime: '22:00', endTime: '06:00' });
  });

  it('makes a birthday repeat every year and have no times', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'Sam', date: FAR, eventType: 'birthday' });
    expect(read.event(created.id)).toMatchObject({ eventType: 'birthday', startTime: null, repeat: { freq: 'yearly', interval: 1, endKind: 'forever' } });
    expect(fails('create_calendar_item', { kind: 'event', title: 'Sam', date: FAR, eventType: 'birthday', startTime: '09:00' }).message).toMatch(/no times/);
  });

  it('creates a travel event that keeps its times (it blocks the slot)', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'Flight to Hanoi', date: FAR, startTime: '08:00', endTime: '11:30', eventType: 'travel' });
    expect(read.event(created.id)).toMatchObject({ eventType: 'travel', startTime: '08:00', endTime: '11:30', repeat: null });
  });

  it('builds a repeat and demands its count or end date', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'Standup', date: FAR, repeat: { freq: 'weekly', endKind: 'count', count: 4 } });
    expect(read.event(created.id)!.repeat).toMatchObject({ freq: 'weekly', interval: 1, endKind: 'count', count: 4, until: null });
    expect(fails('create_calendar_item', { kind: 'event', title: 'x', date: FAR, repeat: { freq: 'weekly', endKind: 'count' } }).message).toMatch(/count is required/);
  });

  it('keeps a link typed in the notes', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'Call', date: FAR, notes: 'Join at https://meet.example.com/abc' });
    expect(read.event(created.id)!.links).toContain('https://meet.example.com/abc');
  });

  it('refuses a reminder-only field', () => {
    expect(fails('create_calendar_item', { kind: 'event', title: 'x', date: FAR, time: '10:00' }).message).toMatch(/startTime/);
  });
});

describe('create_calendar_item: reminders', () => {
  it('creates an all-day reminder with the default notification', () => {
    const { created } = ok('create_calendar_item', { kind: 'reminder', title: 'Pay rent', date: FAR });
    expect(read.reminder(created.id)).toMatchObject({ time: null, notifyDaysBefore: 1, notifyAtTime: '17:00', reminderType: 'default' });
  });

  it('creates a timed reminder', () => {
    const { created } = ok('create_calendar_item', { kind: 'reminder', title: 'Call mum', date: FAR, time: '18:30' });
    expect(read.reminder(created.id)!.time).toBe('18:30');
  });

  it('refuses event-only fields', () => {
    expect(fails('create_calendar_item', { kind: 'reminder', title: 'x', date: FAR, location: 'here' }).message).toMatch(/no location/);
    expect(fails('create_calendar_item', { kind: 'reminder', title: 'x', date: FAR, endTime: '10:00' }).message).toMatch(/no endTime/);
  });
});

describe('create_calendar_item: deadlines', () => {
  it('creates a deadline with the default notification', () => {
    const { created } = ok('create_calendar_item', { kind: 'deadline', title: 'File taxes', date: FAR });
    expect(read.deadline(created.id)).toMatchObject({ time: null, notifyDaysBefore: 1, notifyAtTime: '17:00', deadlineType: 'default' });
  });

  it('keeps the lead-time notification even when a Time is given — a deadline never notifies "at" the moment', () => {
    const { created } = ok('create_calendar_item', { kind: 'deadline', title: 'Submit report', date: FAR, time: '23:59', notifyDaysBefore: 2, notifyAtTime: '09:00' });
    expect(read.deadline(created.id)).toMatchObject({ time: '23:59', notifyDaysBefore: 2, notifyAtTime: '09:00' });
  });

  it('refuses event-only fields', () => {
    expect(fails('create_calendar_item', { kind: 'deadline', title: 'x', date: FAR, location: 'here' }).message).toMatch(/no location/);
    expect(fails('create_calendar_item', { kind: 'deadline', title: 'x', date: FAR, endTime: '10:00' }).message).toMatch(/no endTime/);
  });
});

describe('update_calendar_item', () => {
  it('changes an event and clears a field with null', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'A', date: FAR, startTime: '09:00', endTime: '10:00', location: 'Room 1' });
    ok('update_calendar_item', { id: created.id, title: 'B', location: null, startTime: '09:30' });
    expect(read.event(created.id)).toMatchObject({ title: 'B', location: null, startTime: '09:30', endTime: '10:00' });
  });

  it('checks the resulting times, not just the ones passed', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'A', date: FAR, startTime: '09:00', endTime: '10:00' });
    expect(fails('update_calendar_item', { id: created.id, startTime: '11:00' }).message).toMatch(/not after start/);
    expect(read.event(created.id)!.startTime).toBe('09:00');
  });

  it('can switch tentative and repeat off again', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'A', date: FAR, tentative: true, repeat: { freq: 'daily' } });
    ok('update_calendar_item', { id: created.id, tentative: false, repeat: null });
    expect(read.event(created.id)).toMatchObject({ status: 'confirmed', repeat: null });
  });

  it('follows a task: its scheduled event mirrors changes back to the task', () => {
    const { created: task } = ok('create_task', { title: 'Essay', scheduledAt: FAR, scheduledTime: '10:00' });
    const eventId = read.events()[0].id;
    ok('update_calendar_item', { id: eventId, title: 'Essay draft', date: addDays(FAR, 1), startTime: '11:00', location: 'Library' });
    expect(read.task(task.id)).toMatchObject({ title: 'Essay draft', scheduledAt: addDays(FAR, 1), scheduledTime: '11:00' });
    expect(read.event(eventId)!.location).toBe('Library');
  });

  it('will not repeat, retype, or archive a task-owned event; nor edit a task-owned deadline', () => {
    ok('create_task', { title: 'Essay', scheduledAt: FAR, deadline: FAR });
    const eventId = read.events()[0].id;
    const deadlineId = read.deadlines()[0].id;
    expect(fails('update_calendar_item', { id: eventId, repeat: { freq: 'daily' } }).code).toBe('refused');
    expect(fails('update_calendar_item', { id: deadlineId, title: 'x' }).code).toBe('refused');
    expect(fails('archive_item', { type: 'calendar_item', id: eventId }).code).toBe('refused');
    expect(fails('archive_item', { type: 'calendar_item', id: deadlineId }).code).toBe('refused');
  });

  it('refuses an archived item and an unknown id', () => {
    const { created } = ok('create_calendar_item', { kind: 'reminder', title: 'A', date: FAR });
    ok('archive_item', { type: 'calendar_item', id: created.id, reason: 'no longer needed' });
    expect(fails('update_calendar_item', { id: created.id, title: 'x' }).code).toBe('conflict');
    expect(fails('update_calendar_item', { id: 'ghost', title: 'x' }).code).toBe('not_found');
    ok('restore_item', { type: 'calendar_item', id: created.id });
    ok('update_calendar_item', { id: created.id, title: 'x' });
  });

  it('changes a plain (non-task) deadline and clears a field with null', () => {
    const { created } = ok('create_calendar_item', { kind: 'deadline', title: 'Renew passport', date: FAR, notes: 'bring photo' });
    ok('update_calendar_item', { id: created.id, title: 'Renew passport ASAP', notes: null, notifyDaysBefore: 5 });
    expect(read.deadline(created.id)).toMatchObject({ title: 'Renew passport ASAP', notes: null, notifyDaysBefore: 5 });
  });
});

describe('edit_occurrence', () => {
  const weekly = () => ok('create_calendar_item', { kind: 'event', title: 'Class', date: FAR, startTime: '09:00', endTime: '10:00', repeat: { freq: 'weekly' } }).created.id as string;

  it('skips one date', () => {
    const id = weekly();
    ok('edit_occurrence', { id, date: addDays(FAR, 7), action: 'skip' });
    expect(read.event(id)!.repeat!.exceptions).toEqual([addDays(FAR, 7)]);
  });

  it('detaches a date into its own item', () => {
    const id = weekly();
    const { newItemId } = ok('edit_occurrence', { id, date: addDays(FAR, 14), action: 'detach' });
    expect(read.event(newItemId)).toMatchObject({ date: addDays(FAR, 14), repeat: null });
    expect(read.event(id)!.repeat!.exceptions).toContain(addDays(FAR, 14));
  });

  it('splits into a new series from a date', () => {
    const id = weekly();
    const { newItemId } = ok('edit_occurrence', { id, date: addDays(FAR, 14), action: 'split' });
    expect(read.event(id)!.repeat).toMatchObject({ endKind: 'until', until: addDays(FAR, 13) });
    expect(read.event(newItemId)).toMatchObject({ date: addDays(FAR, 14) });
    expect(read.event(newItemId)!.repeat).not.toBeNull();
  });

  it('ends a series the day before a date', () => {
    const id = weekly();
    ok('edit_occurrence', { id, date: addDays(FAR, 21), action: 'end_series_before' });
    expect(read.event(id)!.repeat).toMatchObject({ endKind: 'until', until: addDays(FAR, 20) });
  });

  it('refuses to end a series before its first date, because that deletes it', () => {
    const id = weekly();
    const e = fails('edit_occurrence', { id, date: FAR, action: 'end_series_before' });
    expect(e.code).toBe('refused');
    expect(read.event(id)).toBeDefined();
    expect(fails('edit_occurrence', { id, date: addDays(FAR, -7), action: 'end_series_before' }).code).toBe('invalid');
  });

  it('refuses an item that does not repeat', () => {
    const { created } = ok('create_calendar_item', { kind: 'event', title: 'One-off', date: FAR });
    expect(fails('edit_occurrence', { id: created.id, date: FAR, action: 'skip' }).message).toMatch(/does not repeat/);
  });

  it('works on a repeating reminder too', () => {
    const { created } = ok('create_calendar_item', { kind: 'reminder', title: 'Water plants', date: FAR, repeat: { freq: 'daily' } });
    ok('edit_occurrence', { id: created.id, date: addDays(FAR, 2), action: 'skip' });
    expect(read.reminder(created.id)!.repeat!.exceptions).toEqual([addDays(FAR, 2)]);
  });

  it('works on a repeating deadline too', () => {
    const { created } = ok('create_calendar_item', { kind: 'deadline', title: 'Pay rent', date: FAR, repeat: { freq: 'monthly' } });
    ok('edit_occurrence', { id: created.id, date: addDays(FAR, 30), action: 'skip' });
    expect(read.deadline(created.id)!.repeat!.exceptions).toEqual([addDays(FAR, 30)]);
  });
});
