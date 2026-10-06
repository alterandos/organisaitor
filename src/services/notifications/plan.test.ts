import { describe, expect, it } from 'vitest';
import { planNotifications, type NotificationSnapshot } from './plan';

const ZONE = 'UTC';
const opts = (from: string, to: string) => ({ from: new Date(from), to: new Date(to), zone: ZONE, clockFormat: '24h' as const });
const empty = (): NotificationSnapshot => ({ tasks: {}, events: {}, reminders: {}, deadlines: {}, schedules: {} });

const base = { notes: null, links: [], collectionId: null, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', remindAt: null, repeat: null, important: false, status: 'confirmed', crossAppRefs: [], archivedAt: null, archiveReason: null };
const reminder = (o: Record<string, unknown>) => ({ ...base, id: 'r1', title: 'Bins', date: '2030-03-10', time: null, reminderType: 'default', notifyDaysBefore: 1, notifyAtTime: '17:00', ...o }) as never;
const deadline = (o: Record<string, unknown>) => ({ ...base, id: 'd1', title: 'Tax return', date: '2030-03-10', time: null, deadlineType: 'default', notifyDaysBefore: 1, notifyAtTime: '17:00', ...o }) as never;
const event = (o: Record<string, unknown>) => ({ ...base, id: 'e1', title: 'Dentist', date: '2030-03-10', endDate: null, startTime: '09:00', endTime: '10:00', location: null, eventType: 'event', notifyBeforeValue: 30, notifyBeforeUnit: 'minutes', notifyAtTime: null, background: false, color: null, source: null, sourceConnectionId: null, sourceCalendarId: null, sourceEventId: null, sourceRaw: null, ...o }) as never;

describe('planNotifications', () => {
  // Regression: from 2026-09-27 (Deadline kind) to 2026-10-06 no Deadline notified anywhere.
  it('a Deadline notifies notifyDaysBefore at notifyAtTime', () => {
    const snap = { ...empty(), deadlines: { d1: deadline({}) } };
    const [n] = planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'));
    expect(n.kind).toBe('deadline');
    expect(n.at.toISOString()).toBe('2030-03-09T17:00:00.000Z');
    expect(n.body).toBe('Due tomorrow');
  });

  it('a Deadline with a time still notifies only before, and says the time', () => {
    const snap = { ...empty(), deadlines: { d1: deadline({ time: '14:00', notifyDaysBefore: 0, notifyAtTime: '09:00' }) } };
    const [n] = planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'));
    expect(n.at.toISOString()).toBe('2030-03-10T09:00:00.000Z');
    expect(n.body).toBe('Due today at 14:00');
  });

  it('a task deadline is silent once its task is completed or archived, and carries the task id otherwise', () => {
    const task = { id: 't1', completed: false, archived: false, calendarDeadlineId: 'd1', calendarReminderId: null };
    const snap = { ...empty(), tasks: { t1: task } as never, deadlines: { d1: deadline({ deadlineType: 'task' }) } };
    expect(planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'))[0].taskId).toBe('t1');
    task.completed = true;
    expect(planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'))).toEqual([]);
  });

  it('a timed reminder fires at its time; a whole-day one at its own notify moment', () => {
    const snap = { ...empty(), reminders: { r1: reminder({ time: '08:30' }), r2: reminder({ id: 'r2' }) } };
    const plan = planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'));
    expect(plan.map((n) => [n.itemId, n.at.toISOString(), n.body])).toEqual([
      ['r2', '2030-03-09T17:00:00.000Z', 'Reminder tomorrow'],
      ['r1', '2030-03-10T08:30:00.000Z', 'Reminder at 08:30'],
    ]);
  });

  it('a repeating reminder notifies every occurrence in the window, skipping exceptions', () => {
    const repeat = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, exceptions: ['2030-03-17'] };
    const snap = { ...empty(), reminders: { r1: reminder({ time: '08:00', repeat }) } };
    const plan = planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T23:59:00Z'));
    expect(plan.map((n) => n.occurrence)).toEqual(['2030-03-10', '2030-03-24', '2030-03-31']);
    expect(new Set(plan.map((n) => n.key)).size).toBe(3);
  });

  it('an event notifies its lead time before the start; null lead = no notification', () => {
    const snap = { ...empty(), events: { e1: event({}), e2: event({ id: 'e2', notifyBeforeValue: null }) } };
    const plan = planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'));
    expect(plan).toHaveLength(1);
    expect(plan[0].at.toISOString()).toBe('2030-03-10T08:30:00.000Z');
    expect(plan[0].body).toBe('Starting at 09:00');
  });

  it('an occurrence marked done (doneDates) no longer notifies; the others still do', () => {
    const repeat = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };
    const snap = { ...empty(), reminders: { r1: reminder({ time: '08:00', repeat, doneDates: ['2030-03-17'] }) }, deadlines: { d1: deadline({ doneDates: ['2030-03-10'] }) } };
    const plan = planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-25T00:00:00Z'));
    expect(plan.map((n) => n.key)).toEqual(['reminder:r1:2030-03-10', 'reminder:r1:2030-03-24']);
  });

  it('a snooze adds one notification and supersedes occurrences before it', () => {
    const snap = { ...empty(), reminders: { r1: reminder({ time: '08:00', remindAt: '2030-03-10T12:00:00.000Z' }) } };
    const plan = planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'));
    expect(plan.map((n) => n.at.toISOString())).toEqual(['2030-03-10T12:00:00.000Z']);
  });

  // Reproduced 2026-10-06: a snooze stood for the series' first date and silenced every date up
  // to the snooze time (a daily reminder snoozed two days skipped day two).
  it('a snooze is for one occurrence: it carries that date and leaves the others alone', () => {
    const daily = { freq: 'daily', interval: 1, endKind: 'forever', count: null, until: null };
    const snap = { ...empty(), reminders: { r1: reminder({ date: '2030-03-01', time: '09:00', repeat: daily, remindAt: '2030-03-12T08:00:00.000Z', remindOccurrence: '2030-03-10' }) } };
    const plan = planNotifications(snap, opts('2030-03-10T00:00:00Z', '2030-03-12T23:59:00Z'));
    expect(plan.map((n) => `${n.occurrence}@${n.at.toISOString().slice(5, 16)}`)).toEqual([
      '2030-03-11@03-11T09:00', // the next day still notifies
      '2030-03-10@03-12T08:00', // the snooze, for the 10th (whose own 09:00 it replaced)
      '2030-03-12@03-12T09:00',
    ]);
  });

  it('acknowledged ("Got it") event and deadline dates never notify again; nor does a snooze for one', () => {
    const snap = {
      ...empty(),
      events: { e1: event({ seenDates: ['2030-03-10'] }) },
      deadlines: { d1: deadline({ seenDates: ['2030-03-10'], remindAt: '2030-03-09T20:00:00.000Z', remindOccurrence: '2030-03-10' }) },
    };
    expect(planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'))).toEqual([]);
  });

  it('archived items never notify; only the window is returned', () => {
    const snap = { ...empty(), reminders: { r1: reminder({ time: '08:00', archivedAt: '2030-01-02T00:00:00Z' }), r2: reminder({ id: 'r2', time: '08:00', date: '2030-05-01' }) } };
    expect(planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'))).toEqual([]);
  });

  it('a committed Schedule occurrence notifies 30 minutes before', () => {
    const snap = { ...empty(), schedules: { s1: { id: 's1', active: true, blocks: [{ id: 'b1', title: 'Gym', startTime: '18:00', requiresCommitment: true, committedDates: ['2030-03-12'] }] } } as never };
    const [n] = planNotifications(snap, opts('2030-03-01T00:00:00Z', '2030-03-31T00:00:00Z'));
    expect(n.itemId).toBe('s1::b1::2030-03-12');
    expect(n.at.toISOString()).toBe('2030-03-12T17:30:00.000Z');
  });
});
