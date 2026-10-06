import { beforeEach, describe, expect, it } from 'vitest';
import { useCalendarStore } from '@/store/calendarStore';
import type { RepeatConfig } from '@/types';
import { acknowledgeOccurrence, archiveOccurrence, postponeDate, postponeOccurrence, snoozeNotificationTarget } from './actions';

beforeEach(() => {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
});

const cal = () => useCalendarStore.getState();
const weekly: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };

describe('Got it', () => {
  it('a reminder occurrence is done; an event or deadline occurrence is only acknowledged', () => {
    const r = cal().addReminder({ title: 'R', date: '2030-03-03', repeat: weekly });
    const e = cal().addEvent({ title: 'E', date: '2030-03-03' });
    const d = cal().addDeadline({ title: 'D', date: '2030-03-03' });
    acknowledgeOccurrence('reminder', r, '2030-03-10');
    acknowledgeOccurrence('event', e, undefined);
    acknowledgeOccurrence('deadline', d, undefined);
    expect(cal().reminders[r].doneDates).toEqual(['2030-03-10']);
    expect(cal().events[e].seenDates).toEqual(['2030-03-03']);
    expect(cal().deadlines[d].seenDates).toEqual(['2030-03-03']);
    expect(cal().deadlines[d].doneDates).toEqual([]);
  });
});

describe('Snooze', () => {
  it('records which occurrence the snooze is for', () => {
    const r = cal().addReminder({ title: 'R', date: '2030-03-03', repeat: weekly });
    snoozeNotificationTarget('reminder', r, '2030-03-10T12:00:00.000Z', '2030-03-10');
    expect(cal().reminders[r]).toMatchObject({ remindAt: '2030-03-10T12:00:00.000Z', remindOccurrence: '2030-03-10' });
  });
});

describe('Postpone', () => {
  it('presets are tomorrow / a week from today, and only when that is later than the occurrence', () => {
    expect(postponeDate('tomorrow', '2030-03-10', '2030-03-10')).toBe('2030-03-11');
    expect(postponeDate('next-week', '2030-03-10', '2030-03-10')).toBe('2030-03-17');
    expect(postponeDate('tomorrow', '2030-03-11', '2030-03-10')).toBeNull();
  });

  it('moves a one-off item, keeping its time unless a new one is given, and clears its snooze', () => {
    const r = cal().addReminder({ title: 'R', date: '2030-03-10', time: '09:00' });
    snoozeNotificationTarget('reminder', r, '2030-03-10T12:00:00.000Z');
    expect(postponeOccurrence('reminder', r, '2030-03-10', { date: '2030-03-11' })).toBe(r);
    expect(cal().reminders[r]).toMatchObject({ date: '2030-03-11', time: '09:00', remindAt: null, remindOccurrence: null });
    postponeOccurrence('reminder', r, '2030-03-11', { date: '2030-03-12', time: '15:30' });
    expect(cal().reminders[r]).toMatchObject({ date: '2030-03-12', time: '15:30' });
  });

  it('a repeating item moves just that date: a linked copy, and the series skips it', () => {
    const d = cal().addDeadline({ title: 'D', date: '2030-03-03', repeat: weekly });
    const moved = postponeOccurrence('deadline', d, '2030-03-10', { date: '2030-03-12' }) as typeof d;
    expect(moved).not.toBe(d);
    expect(cal().deadlines[moved]).toMatchObject({ date: '2030-03-12', repeat: null, seriesId: d, seriesDate: '2030-03-10' });
    expect(cal().deadlines[d].repeat?.exceptions).toContain('2030-03-10');
    expect(cal().deadlines[d].date).toBe('2030-03-03');
  });

  it('an event keeps its length, and a multi-day event its span', () => {
    const e = cal().addEvent({ title: 'E', date: '2030-03-10', endDate: '2030-03-11', startTime: '09:00', endTime: '10:30' });
    postponeOccurrence('event', e, '2030-03-10', { date: '2030-03-17', time: '14:00' });
    expect(cal().events[e]).toMatchObject({ date: '2030-03-17', endDate: '2030-03-18', startTime: '14:00', endTime: '15:30' });
  });
});

describe('Archive', () => {
  it('a repeating item archives that date only by default, and Undo restores it', () => {
    const r = cal().addReminder({ title: 'R', date: '2030-03-03', repeat: weekly });
    const undo = archiveOccurrence('reminder', r, '2030-03-10', false)!;
    const copy = Object.values(cal().reminders).find((x) => x.seriesId === r)!;
    expect(copy).toMatchObject({ date: '2030-03-10' });
    expect(copy.archivedAt).not.toBeNull();
    expect(cal().reminders[r].archivedAt).toBeNull();
    undo();
    expect(cal().reminders[copy.id].archivedAt).toBeNull();
  });

  it('with the whole series ticked, the item itself is archived', () => {
    const e = cal().addEvent({ title: 'E', date: '2030-03-03', repeat: weekly });
    archiveOccurrence('event', e, '2030-03-10', true);
    expect(cal().events[e].archivedAt).not.toBeNull();
    expect(Object.keys(cal().events)).toHaveLength(1);
  });
});
