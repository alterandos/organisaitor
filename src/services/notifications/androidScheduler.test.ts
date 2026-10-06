import { beforeEach, describe, expect, it } from 'vitest';
import { applyQuietHours, buildAndroidSchedule, handleAction, notificationId, MAX_SCHEDULED } from './androidScheduler';
import { snoozeTime } from './actions';
import { useCalendarStore } from '@/store/calendarStore';
import type { NotificationSnapshot } from './plan';

const ZONE = 'UTC';
const settings = { notifyReminders: true, notifyEvents: true, quietHours: { enabled: false, start: '22:00', end: '07:00' } };
const base = { notes: null, links: [], collectionId: null, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', remindAt: null, repeat: null, important: false, status: 'confirmed', crossAppRefs: [], archivedAt: null, archiveReason: null, doneDates: [] };
const reminder = (o: Record<string, unknown>) => ({ ...base, id: 'r1', title: 'Bins', date: '2030-03-10', time: '23:30', reminderType: 'default', notifyDaysBefore: 1, notifyAtTime: '17:00', ...o }) as never;
const snap = (o: Partial<NotificationSnapshot>): NotificationSnapshot => ({ tasks: {}, events: {}, reminders: {}, deadlines: {}, schedules: {}, ...o });
const NOW = new Date('2030-03-01T00:00:00Z');

describe('androidScheduler', () => {
  it('notificationId is stable, positive and differs per key', () => {
    expect(notificationId('reminder:r1:2030-03-10')).toBe(notificationId('reminder:r1:2030-03-10'));
    expect(notificationId('reminder:r1:2030-03-10')).not.toBe(notificationId('reminder:r1:2030-03-17'));
    expect(notificationId('x')).toBeGreaterThan(0);
  });

  it('books the next 14 days only, with buttons and channel by kind', () => {
    const s = snap({ reminders: { r1: reminder({}), r2: reminder({ id: 'r2', date: '2030-04-20' }) } });
    const [n, ...rest] = buildAndroidSchedule(s, settings, NOW, ZONE, '24h');
    expect(rest).toEqual([]);
    expect(n.schedule?.at?.toISOString()).toBe('2030-03-10T23:30:00.000Z');
    expect(n.channelId).toBe('reminders');
    expect(n.actionTypeId).toBe('done');
    expect(n.extra).toMatchObject({ kind: 'reminder', itemId: 'r1', occurrence: '2030-03-10' });
  });

  it('honours the per-kind switches', () => {
    const s = snap({ reminders: { r1: reminder({}) } });
    expect(buildAndroidSchedule(s, { ...settings, notifyReminders: false }, NOW, ZONE, '24h')).toEqual([]);
  });

  it('quiet hours move a notification to when they end, except important ones', () => {
    const quiet = { enabled: true, start: '22:00', end: '07:00' };
    const s = snap({ reminders: { r1: reminder({}), r2: reminder({ id: 'r2', important: true }) } });
    const [moved, important] = buildAndroidSchedule(s, { ...settings, quietHours: quiet }, NOW, ZONE, '24h')
      .sort((a, b) => String(a.extra.itemId).localeCompare(String(b.extra.itemId)));
    expect(moved.schedule?.at?.toISOString()).toBe('2030-03-11T07:00:00.000Z');
    expect(important.schedule?.at?.toISOString()).toBe('2030-03-10T23:30:00.000Z');
    expect(important.channelId).toBe('important');
  });

  it('applyQuietHours: before midnight → next morning, after midnight → same morning, outside → unchanged', () => {
    const q = { enabled: true, start: '22:00', end: '07:00' };
    expect(applyQuietHours(new Date('2030-03-10T23:00:00Z'), ZONE, q).toISOString()).toBe('2030-03-11T07:00:00.000Z');
    expect(applyQuietHours(new Date('2030-03-11T03:00:00Z'), ZONE, q).toISOString()).toBe('2030-03-11T07:00:00.000Z');
    expect(applyQuietHours(new Date('2030-03-11T12:00:00Z'), ZONE, q).toISOString()).toBe('2030-03-11T12:00:00.000Z');
  });

  it(`never books more than ${MAX_SCHEDULED}`, () => {
    const repeat = { freq: 'daily', interval: 1, endKind: 'forever', count: null, until: null };
    const reminders = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`r${i}`, reminder({ id: `r${i}`, date: '2030-03-01', time: '12:00', repeat })]));
    expect(buildAndroidSchedule(snap({ reminders }), settings, NOW, ZONE, '24h')).toHaveLength(MAX_SCHEDULED);
  });

  it('snoozeTime: 1 hour, tomorrow morning, this evening (or tomorrow evening once it has passed)', () => {
    const now = new Date('2030-03-10T19:00:00Z');
    expect(snoozeTime('1h', now, ZONE, '09:00', '18:00').toISOString()).toBe('2030-03-10T20:00:00.000Z');
    expect(snoozeTime('morning', now, ZONE, '09:00', '18:00').toISOString()).toBe('2030-03-11T09:00:00.000Z');
    expect(snoozeTime('evening', now, ZONE, '09:00', '18:00').toISOString()).toBe('2030-03-11T18:00:00.000Z');
    expect(snoozeTime('evening', new Date('2030-03-10T10:00:00Z'), ZONE, '09:00', '18:00').toISOString()).toBe('2030-03-10T18:00:00.000Z');
  });

  describe('handleAction', () => {
    beforeEach(() => useCalendarStore.setState(useCalendarStore.getInitialState(), true));

    it('"Done" marks that occurrence done; a snooze sets remindAt', () => {
      const id = useCalendarStore.getState().addReminder({ title: 'Bins', date: '2030-03-10', time: '08:00' });
      const extra = { key: `reminder:${id}:2030-03-10`, kind: 'reminder', itemId: id, occurrence: '2030-03-10', taskId: null };
      handleAction({ actionId: 'done', notification: { id: 1, title: '', body: '', extra } });
      expect(useCalendarStore.getState().reminders[id].doneDates).toEqual(['2030-03-10']);
      handleAction({ actionId: 'snooze-1h', notification: { id: 1, title: '', body: '', extra } });
      expect(useCalendarStore.getState().reminders[id].remindAt).not.toBeNull();
    });
  });
});
