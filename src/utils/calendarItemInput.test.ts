import { describe, expect, it } from 'vitest';
import { BIRTHDAY_REPEAT, buildCalendarEventInput, buildCalendarReminderInput } from '@/utils/calendarItemInput';
import { createScheduleBlock } from '@/utils/scheduleBlocks';
import { useScheduleStore } from '@/store/scheduleStore';

describe('buildCalendarEventInput', () => {
  const base = { title: 'Meet', date: '2031-03-10' };

  it('turns empty strings into null', () => {
    const out = buildCalendarEventInput({ ...base, startTime: '', endTime: '', notes: '', location: '' });
    expect(out).toMatchObject({ startTime: null, endTime: null, notes: null, location: null, collectionId: null });
  });

  it('only keeps an end date after the start date', () => {
    expect(buildCalendarEventInput({ ...base, endDate: '2031-03-10' }).endDate).toBeNull();
    expect(buildCalendarEventInput({ ...base, endDate: '2031-03-09' }).endDate).toBeNull();
    expect(buildCalendarEventInput({ ...base, endDate: '2031-03-11' }).endDate).toBe('2031-03-11');
  });

  it('gives a birthday no times and a yearly repeat, and only birthdays keep notifyAtTime', () => {
    const b = buildCalendarEventInput({ ...base, eventType: 'birthday', startTime: '09:00', endTime: '10:00', notifyAtTime: '08:00' });
    expect(b).toMatchObject({ startTime: null, endTime: null, notifyAtTime: '08:00', repeat: BIRTHDAY_REPEAT });
    expect(buildCalendarEventInput({ ...base, notifyAtTime: '08:00' }).notifyAtTime).toBeNull();
  });

  it('keeps a repeat the caller gave a birthday', () => {
    const repeat = { freq: 'yearly' as const, interval: 2, endKind: 'forever' as const, count: null, until: null };
    expect(buildCalendarEventInput({ ...base, eventType: 'birthday', repeat }).repeat).toBe(repeat);
  });

  it('copies links typed into the notes', () => {
    expect(buildCalendarEventInput({ ...base, notes: 'see https://a.example/x', links: ['https://b.example'] }).links)
      .toEqual(['https://b.example', 'https://a.example/x']);
  });
});

describe('buildCalendarReminderInput', () => {
  it('turns empty strings into null and merges links', () => {
    const out = buildCalendarReminderInput({ title: 'R', date: '2031-03-10', time: '', notes: 'https://a.example', collectionId: null });
    expect(out).toMatchObject({ time: null, links: ['https://a.example'], collectionId: null, repeat: null });
  });
});

describe('createScheduleBlock', () => {
  it('fills in every default', () => {
    const b = createScheduleBlock({ title: '  Maths ', daysOfWeek: [1], startTime: '09:00', endTime: '10:00', intervalAnchor: '2031-03-10', location: '  ' });
    expect(b).toMatchObject({
      title: 'Maths', location: null, interval: 1, exceptions: [], notes: null, requiresCommitment: false, committedDates: [],
    });
    expect(b.id).toHaveLength(8);
  });

  it('gives each block its own id', () => {
    const args = { title: 'x', daysOfWeek: [1], startTime: '09:00', endTime: '10:00', intervalAnchor: '2031-03-10' };
    expect(createScheduleBlock(args).id).not.toBe(createScheduleBlock(args).id);
  });
});

describe('scheduleStore.addSchedule', () => {
  it('keeps the blocks it is given, so no second update is needed', () => {
    const block = createScheduleBlock({ title: 'x', daysOfWeek: [1], startTime: '09:00', endTime: '10:00', intervalAnchor: '2031-03-10' });
    const id = useScheduleStore.getState().addSchedule({ name: 'S', blocks: [block] });
    expect(useScheduleStore.getState().schedules[id].blocks).toEqual([block]);
    const empty = useScheduleStore.getState().addSchedule({ name: 'E' });
    expect(useScheduleStore.getState().schedules[empty].blocks).toEqual([]);
  });
});
