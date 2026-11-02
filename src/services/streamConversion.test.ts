import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { saveStreams, setTick, setTickField } from './rhythms';
import { convertRhythmStreams } from './streamConversion';
import { STREAM_KINDS } from '@/config/streamKinds';
import type { CalendarEventId, CollectionId, RhythmStream, StreamKind, StreamRule } from '@/types';

// Rhythm streams converted to repeating calendar items (phase 7 (e), automatic): Work from do-by and
// hand-in streams, attended marks from attend streams, a date with details taken out, goals moved.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2031, 2, 20, 10, 0));
  for (const s of [useTaskStore, useCalendarStore, useTrackerStore, useScheduleStore, useGoalStore, useItemTypeStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});
afterEach(() => { vi.useRealTimers(); });

const stream = (id: string, label: string, kind: StreamKind, rule: StreamRule, extra: Partial<RhythmStream> = {}): RhythmStream =>
  ({ id, label, kind, rule, typeId: null, start: '2031-03-02', time: null, show: { ...STREAM_KINDS[kind].show }, notebookId: null, ...extra });

function setup() {
  const t = useTaskStore.getState();
  const subject = t.addCollection({ kind: 'project', name: 'GEOS215' });
  const lecture = useCalendarStore.getState().addEvent({ title: 'GEOS215 lecture', date: '2031-03-04', startTime: '12:00', collectionId: subject,
    repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [2] } });
  const mark = useItemTypeStore.getState().addItemType({ name: 'Reading', icon: null, extendsId: null, fields: [{ id: 'pages', name: 'Pages', type: 'text' }], defaults: {}, parts: [] });
  const weekly = t.addCollection({ kind: 'routine', name: 'GEOS215 each week' });
  t.updateCollection(weekly, { collectionId: subject });
  saveStreams(weekly, [
    stream('att', 'Lecture', 'attend', { kind: 'follows', eventIds: [lecture], offsetDays: 0 }),
    stream('read', 'Reading', 'doBy', { kind: 'follows', eventIds: [lecture], offsetDays: -1 }, { typeId: mark }),
    stream('quiz', 'Quiz', 'submit', { kind: 'repeat', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [5] } }, { time: '17:00', worth: 10 }),
  ]);
  setTick(weekly, 'att', '2031-03-04', 'done');
  setTick(weekly, 'read', '2031-03-03', 'done');
  setTickField(weekly, 'read', '2031-03-10', 'pages', '12–30');
  setTick(weekly, 'quiz', '2031-03-07', 'done');
  setTick(weekly, 'quiz', '2031-03-14', 'notNeeded');
  const goal = useGoalStore.getState().addGoal({ title: 'Keep up the reading', target: { type: 'endeavour', id: subject }, by: null, measure: { kind: 'consistency', rhythmId: weekly, streamId: 'read', count: 4, outOf: 5 } });
  return { subject, lecture: lecture as CalendarEventId, weekly, goal };
}

describe('converting rhythm streams', () => {
  it('makes Work and attended marks, takes a date with details out, moves the goal, and archives the emptied routine', () => {
    const { subject, lecture, weekly, goal } = setup();
    expect(convertRhythmStreams()).toBe(2);

    const { events, deadlines } = useCalendarStore.getState();
    expect(events[lecture].attendedDates).toEqual(['2031-03-04']);

    const work = Object.values(deadlines).filter((d) => !d.seriesId);
    const reading = work.find((d) => d.title === 'Reading')!;
    expect(reading).toMatchObject({ collectionId: subject, date: '2031-03-03', doneDates: ['2031-03-03'], repeat: { freq: 'dates', follows: { ids: [lecture], offsetDays: -1 } } });
    const taken = Object.values(deadlines).find((d) => d.seriesId === reading.id)!;
    expect(taken).toMatchObject({ date: '2031-03-10', seriesDate: '2031-03-10', typeFields: { pages: '12–30' } });
    expect(reading.repeat!.exceptions).toContain('2031-03-10');

    const quiz = work.find((d) => d.title === 'Quiz')!;
    expect(quiz).toMatchObject({ date: '2031-03-07', time: '17:00', doneDates: ['2031-03-07'], typeFields: { weight: 10 } });
    expect(quiz.repeat!.exceptions).toEqual(['2031-03-14']);

    expect(useGoalStore.getState().goals[goal].measure).toEqual({ kind: 'keepUp', itemIds: [reading.id], count: 4, outOf: 5 });
    const routine = useTaskStore.getState().collections[weekly as CollectionId];
    expect(routine.streams ?? []).toEqual([]);
    expect(routine.archivedAt).toBeTruthy();
    expect(Object.keys(useTrackerStore.getState().entries).length).toBeGreaterThan(0);   // the ticks stay in Records

    // Run again (the next load, or another device): nothing more.
    expect(convertRhythmStreams()).toBe(0);
    expect(Object.keys(useCalendarStore.getState().deadlines)).toHaveLength(Object.keys(deadlines).length);
  });

  it('a routine with its own stream or steps is kept, as it was before it had streams', () => {
    const t = useTaskStore.getState();
    const r = t.addCollection({ kind: 'routine', name: 'Morning', routineTasks: [{ id: 'a', title: 'Stretch', order: 0 }] });
    saveStreams(r, [stream('x', 'Journal', 'doBy', { kind: 'repeat', repeat: { freq: 'daily', interval: 1, endKind: 'forever', count: null, until: null } })]);
    convertRhythmStreams();
    expect(useTaskStore.getState().collections[r].archivedAt).toBeNull();
    expect(Object.values(useCalendarStore.getState().deadlines).map((d) => [d.title, d.collectionId])).toEqual([['Journal', null]]);
  });
});
