import { describe, expect, it } from 'vitest';
import type { Collection, CollectionId, RhythmStream, ScheduleId, ScheduleTemplate, TrackerEntry, TrackerEntryId } from '@/types';
import {
  boardWeeks, legacyStream, occurrenceState, rhythmOccurrences, rhythmStreams, showsInTasks,
  streamDates, streamTime, tickIndex, tickKey, weekStart,
} from './rhythms';

const routine = (extra: Partial<Collection> = {}): Collection => ({
  id: 'r1' as CollectionId, kind: 'routine', name: 'Morning', description: null, color: null,
  purposeIds: [], tagIds: [], deadline: null, fieldSchema: [], routineTasks: [], repeatConfig: null,
  collectionId: null, archivedAt: null, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '', ...extra,
} as Collection);

const timetable: ScheduleTemplate = {
  id: 's1' as ScheduleId, name: 'Sem 2', color: null, startDate: '2026-09-01', endDate: '2026-12-01', active: true,
  collectionId: null, createdAt: '', updatedAt: '',
  blocks: [{ id: 'lec', title: 'GEOS215 lecture', daysOfWeek: [2], startTime: '10:00', endTime: '11:00', location: null,
    interval: 1, intervalAnchor: '2026-09-01', exceptions: ['2026-10-20'], notes: null, requiresCommitment: false, committedDates: [] }],
};
const schedules = { s1: timetable };

const stream = (extra: Partial<RhythmStream>): RhythmStream => ({
  id: 'st', label: 'Reading', kind: 'doBy', typeId: null, rule: { kind: 'relative', scheduleId: 's1' as ScheduleId, blockId: 'lec', offsetDays: -1 },
  start: '2026-10-01', time: null, show: { calendar: 'marker', tasks: 'near', notify: false }, notebookId: null, ...extra,
});

const entry = (id: string, date: string, data: Record<string, unknown>): TrackerEntry =>
  ({ id: id as TrackerEntryId, trackerId: 'r1' as CollectionId, date, data, notes: null, createdAt: '', updatedAt: '' });

describe('a routine read as a rhythm', () => {
  it('a routine never given streams is one stream, with its own id, days and start, showing nowhere new', () => {
    const r = routine({ repeatConfig: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [1, 3] } });
    const [s] = rhythmStreams(r);
    expect(s).toMatchObject({ id: 'r1', label: 'Morning', start: '2026-10-01', show: { calendar: 'none', tasks: 'never', notify: false } });
    expect(streamDates(s, {}, '2026-10-05', '2026-10-11')).toEqual(['2026-10-05', '2026-10-07']);
    expect(rhythmStreams(routine({ streams: [stream({})] }))[0].id).toBe('st');
  });

  it('its completions before rhythms read as done on that stream', () => {
    const ticks = tickIndex({ e1: entry('e1', '2026-10-05', {}) }, { r1: routine() });
    expect(ticks.get(tickKey('r1', 'r1', '2026-10-05'))).toMatchObject({ status: 'done', fields: {} });
  });
});

describe('a stream’s dates', () => {
  it('its own repeat starts at its start, and a start off the named weekdays is not one', () => {
    const daily = legacyStream(routine());
    expect(streamDates(daily, {}, '2026-09-28', '2026-10-02')).toEqual(['2026-10-01', '2026-10-02']);
    const fridays = stream({ rule: { kind: 'repeat', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [5] } }, start: '2026-10-01' });
    expect(streamDates(fridays, {}, '2026-10-01', '2026-10-17')).toEqual(['2026-10-02', '2026-10-09', '2026-10-16']);
  });

  it('a stream from a timetable class follows the class, offset, skipping a cancelled one', () => {
    const before = stream({});
    expect(streamDates(before, schedules, '2026-10-01', '2026-10-31')).toEqual(['2026-10-05', '2026-10-12', '2026-10-26']);
    const lecture = stream({ rule: { kind: 'relative', scheduleId: 's1' as ScheduleId, blockId: 'lec', offsetDays: 0 } });
    expect(streamTime(lecture, schedules)).toBe('10:00');
    expect(streamDates(lecture, { s1: { ...timetable, active: false } }, '2026-10-01', '2026-10-31')).toEqual([]);
  });
});

describe('occurrences and their state', () => {
  it('ticked, skipped, behind, today and coming up', () => {
    const r = routine({ streams: [stream({})] });
    const ticks = tickIndex({
      a: entry('a', '2026-10-05', { _stream: 'st', _status: 'done' }),
      b: entry('b', '2026-10-12', { _stream: 'st', _status: 'skipped', pages: '20' }),
    }, { r1: r });
    const occ = rhythmOccurrences(r, schedules, ticks, '2026-10-01', '2026-11-03', '2026-10-26');
    expect(occ.map((o) => [o.date, o.state])).toEqual([
      ['2026-10-05', 'done'], ['2026-10-12', 'skipped'], ['2026-10-26', 'today'], ['2026-11-02', 'upcoming'],
    ]);
    expect(occ[1].tick?.fields).toEqual({ pages: '20' });
    expect(occurrenceState('2026-10-19', undefined, '2026-10-26')).toBe('behind');
    expect(occurrenceState('2026-10-19', { entryId: 'x', status: null, fields: { a: 1 }, noteId: null }, '2026-10-26')).toBe('behind');
  });

  it('shows in Tasks by its setting: close, always, or never', () => {
    const r = routine({ streams: [stream({})] });
    const occ = (show: RhythmStream['show']['tasks'], date: string) =>
      rhythmOccurrences(routine({ streams: [stream({ show: { calendar: 'none', tasks: show, notify: false } })] }), schedules, new Map(), date, date, '2026-10-20')[0]
      ?? rhythmOccurrences(r, schedules, new Map(), date, date, '2026-10-20')[0];
    expect(showsInTasks(occ('near', '2026-10-26'), '2026-10-20')).toBe(false);
    expect(showsInTasks(occ('near', '2026-10-26'), '2026-10-25')).toBe(true);
    expect(showsInTasks(occ('always', '2026-10-26'), '2026-10-20')).toBe(true);
    expect(showsInTasks(occ('never', '2026-10-12'), '2026-10-20')).toBe(false);
    expect(showsInTasks(occ('near', '2026-10-12'), '2026-10-20')).toBe(true);
  });
});

describe('the board’s weeks', () => {
  it('weeks run Monday to Sunday', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(boardWeeks('2026-10-28', 1, 1)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
  });
});
