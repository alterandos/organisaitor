import { beforeEach, describe, expect, it } from 'vitest';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useTaskStore } from '@/store/taskStore';
import { useTrashStore } from '@/store/trashStore';
import {
  applyScheduleBounds, commitOccurrence, convertLegacySchedules, createScheduleWithItems, deleteScheduleWithItems,
  isCommittedOccurrence, saveScheduleRows, skipItemDate, uncommitOccurrence,
} from './schedules';
import { planNotifications } from './notifications/plan';
import { hiddenBySchedule, withItemRows } from '@/utils/scheduleItems';
import { STREAM_KINDS } from '@/config/streamKinds';
import type { CalendarEventId, CollectionId, RhythmStream, ScheduleBlock, ScheduleId, ScheduleTemplate } from '@/types';

// Schedules rebuilt on calendar events (docs/features/endeavours.md phase 7 (c)).

const MON = '2030-03-04';
const cal = () => useCalendarStore.getState();
const row = (o: Partial<ScheduleBlock> = {}): ScheduleBlock => ({
  id: 'b1', title: 'Spin', daysOfWeek: [1, 3], startTime: '10:00', endTime: '11:00', location: 'Gym', interval: 1,
  intervalAnchor: MON, exceptions: [], notes: null, requiresCommitment: false, committedDates: [], ...o,
});

beforeEach(() => {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useScheduleStore.setState(useScheduleStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
});

describe('a Schedule kept before phase 7 is converted once', () => {
  it('each row becomes a repeating event stamped with the Schedule’s time; committed dates are confirmed copies; streams follow', () => {
    const legacy: ScheduleTemplate = {
      id: 's1' as ScheduleId, name: 'Gym', color: null, startDate: MON, endDate: '2030-04-26', active: true, collectionId: null,
      blocks: [row({ exceptions: ['2030-03-11'], requiresCommitment: true, committedDates: ['2030-03-13'] })],
      createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-02T00:00:00.000Z',
    };
    useScheduleStore.setState({ schedules: { s1: legacy } as never });
    const rhythm = useTaskStore.getState().addCollection({ kind: 'routine', name: 'Gym week' });
    const stream: RhythmStream = { id: 'st', label: 'Stretch', kind: 'doBy', typeId: null, start: MON, time: null, show: { ...STREAM_KINDS.doBy.show }, notebookId: null, rule: { kind: 'relative', scheduleId: 's1' as ScheduleId, blockId: 'b1', offsetDays: -1 } };
    useTaskStore.getState().updateCollection(rhythm, { streams: [stream] });

    expect(convertLegacySchedules()).toBe(2);
    const id = Object.values(cal().events).find((e) => e.repeat && e.scheduleId === 's1')!.id;
    expect(cal().events[id]).toMatchObject({
      title: 'Spin', date: MON, startTime: '10:00', status: 'tentative', scheduleId: 's1', updatedAt: legacy.updatedAt,
      repeat: { freq: 'weekly', daysOfWeek: [1, 3], endKind: 'until', until: '2030-04-26', exceptions: ['2030-03-11', '2030-03-13'] },
    });
    const copy = Object.values(cal().events).find((e) => e.seriesId === id)!;
    expect(copy).toMatchObject({ date: '2030-03-13', seriesId: id, status: 'confirmed', notifyBeforeValue: 30, notifyBeforeUnit: 'minutes', repeat: null });
    expect(isCommittedOccurrence(copy)).toBe(true);
    expect(useScheduleStore.getState().schedules['s1' as ScheduleId].blocks).toEqual([]);
    expect(useTaskStore.getState().collections[rhythm].streams![0].rule).toEqual({ kind: 'follows', eventIds: [id], offsetDays: -1 });

    // The confirmed date notifies 30 minutes before; the dates not gone to don't.
    const planned = planNotifications({ tasks: {}, events: cal().events, reminders: {}, deadlines: {}, schedules: {} },
      { from: new Date('2030-03-01T00:00:00Z'), to: new Date('2030-03-31T00:00:00Z'), zone: 'UTC', clockFormat: '24h' });
    expect(planned.map((n) => n.at.toISOString())).toEqual(['2030-03-13T09:30:00.000Z']);

    expect(convertLegacySchedules()).toBe(0);
  });
});

describe('a Schedule’s period and breaks bound its items', () => {
  it('takes its Endeavour’s, live; the person’s own skips are kept apart from the breaks’', () => {
    const t = useTaskStore.getState();
    const subject = t.addCollection({ kind: 'project', name: 'GEOS215' });
    t.updateCollection(subject, { period: { start: MON, end: '2030-04-26', breaks: [{ id: 'mid', label: 'Break', from: '2030-03-18', to: '2030-03-22' }] } });
    const { itemIds } = createScheduleWithItems({ name: 'Timetable', collectionId: subject }, [row({ daysOfWeek: [1] })]);
    const id = itemIds.get('b1')!;
    expect(cal().events[id].repeat).toMatchObject({ until: '2030-04-26', exceptions: ['2030-03-18', '2030-03-19', '2030-03-20', '2030-03-21', '2030-03-22'] });

    skipItemDate(id, '2030-03-25');
    t.updateCollection(subject, { period: { start: MON, end: '2030-04-26', breaks: [{ id: 'mid', label: 'Break', from: '2030-03-25', to: '2030-03-26' }] } });
    applyScheduleBounds();
    expect(cal().events[id].repeat).toMatchObject({ exceptions: ['2030-03-25', '2030-03-26'], breakSkips: ['2030-03-26'] });

    t.updateCollection(subject, { period: { start: MON, end: '2030-04-26', breaks: [] } });
    applyScheduleBounds();
    expect(cal().events[id].repeat?.exceptions).toEqual(['2030-03-25']);
    expect(cal().events[id].repeat?.breakSkips).toBeUndefined();
  });
});

describe('going to one date of an item you don’t always go to', () => {
  it('takes it out of the series, confirmed; not going puts it back', () => {
    const { itemIds } = createScheduleWithItems({ name: 'Gym', startDate: MON }, [row({ requiresCommitment: true })]);
    const id = itemIds.get('b1')!;
    expect(cal().events[id].status).toBe('tentative');
    const copy = commitOccurrence(id, '2030-03-06')!;
    expect(cal().events[copy]).toMatchObject({ date: '2030-03-06', status: 'confirmed', scheduleId: cal().events[id].scheduleId, notifyBeforeValue: 30 });
    expect(cal().events[id].repeat?.exceptions).toContain('2030-03-06');
    expect(withItemRows(useScheduleStore.getState().schedules[cal().events[id].scheduleId!], cal().events).blocks[0]).toMatchObject({ exceptions: [], committedDates: ['2030-03-06'] });

    uncommitOccurrence(copy);
    expect(cal().events[copy]).toBeUndefined();
    expect(cal().events[id].repeat?.exceptions).toEqual([]);
  });
});

describe('a Schedule’s rows are its items', () => {
  it('saving rows changes, adds and removes items; switching it off hides them; deleting it deletes them', () => {
    const { id, itemIds } = createScheduleWithItems({ name: 'Term', startDate: MON }, [row(), row({ id: 'b2', title: 'Swim', daysOfWeek: [5] })]);
    const rows = withItemRows(useScheduleStore.getState().schedules[id], cal().events).blocks;
    expect(rows.map((r) => r.title).sort()).toEqual(['Spin', 'Swim']);

    const spin = rows.find((r) => r.title === 'Spin')!;
    saveScheduleRows(id, [{ ...spin, title: 'Spin class', daysOfWeek: [2] }, row({ id: 'new', title: 'Yoga', daysOfWeek: [6] })]);
    const after = Object.values(cal().events).filter((e) => e.scheduleId === id);
    expect(after.map((e) => [e.title, e.date]).sort()).toEqual([['Spin class', '2030-03-05'], ['Yoga', '2030-03-09']]);
    expect(cal().events[itemIds.get('b2')!]).toBeUndefined();

    useScheduleStore.getState().toggleScheduleActive(id);
    expect(after.every((e) => hiddenBySchedule(e, useScheduleStore.getState().schedules))).toBe(true);

    deleteScheduleWithItems(id);
    expect(Object.values(cal().events).filter((e) => e.scheduleId === id)).toHaveLength(0);
    expect(useScheduleStore.getState().schedules[id]).toBeUndefined();
    expect(Object.values(useTrashStore.getState().entries).map((e) => e.kind).sort()).toEqual(['calendarEvent', 'calendarEvent', 'calendarEvent', 'schedule']);
  });

  it('filing it under another Endeavour files its items too', async () => {
    const { moveSchedule } = await import('./schedules');
    const to = useTaskStore.getState().addCollection({ kind: 'project', name: 'P' }) as CollectionId;
    const { id, itemIds } = createScheduleWithItems({ name: 'Term', startDate: MON }, [row()]);
    moveSchedule(id, to);
    expect(cal().events[itemIds.get('b1')! as CalendarEventId].collectionId).toBe(to);
  });
});
