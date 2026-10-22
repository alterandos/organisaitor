import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useToastStore } from '@/store/toastStore';
import { setHydrating } from '@/services/sync/hydrating';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { initEventTaskFollow, linkTaskToEvent, linkedTaskDates, unlinkTaskFromEvent } from './eventTaskLinks';
import { anchorOf, followMove, tasksLinkedTo } from '@/utils/eventTaskLinks';
import { runwayBands } from '@/overview/timeline';
import { SOURCE_BY_KEY } from '@/overview/sources';
import type { CalendarEvent, CalendarEventId, TaskId } from '@/types';

// Tasks linked to events and Deadlines (agreed with the user 2026-10-23): the dates a link gives,
// following a moved event (with Undo; not for a change sync brings), and the Runway grouping.

const TODAY = '2026-10-23';
let stop: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useToastStore.setState(useToastStore.getInitialState(), true);
  stop = initEventTaskFollow();
});
afterEach(() => { stop(); vi.useRealTimers(); });

const tasks = () => useTaskStore.getState().tasks;
const exam = (date = '2026-11-10', more: Partial<CalendarEvent> = {}) =>
  useCalendarStore.getState().addEvent({ title: 'Exam', date, startTime: '09:00', endTime: '11:00', ...more });

describe('the dates a link gives', () => {
  it('preparation is due when the event starts; a follow-up starts when it ends; related takes nothing', () => {
    const id = exam('2026-11-10', { endDate: '2026-11-12' });
    expect(linkedTaskDates('prepFor', 'event', id)).toEqual({ deadline: '2026-11-10', deadlineTime: '09:00' });
    expect(linkedTaskDates('followUpOf', 'event', id)).toEqual({ scheduledAt: '2026-11-12' });
    expect(linkedTaskDates('related', 'event', id)).toEqual({});
  });

  it('a repeating event is linked as a series: the dates come from its next occurrence', () => {
    const id = exam('2026-10-01', { repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null } });
    expect(anchorOf('event', useCalendarStore.getState().events[id], TODAY).start).toBe('2026-10-29');
  });

  it('linking an existing task fills a missing date, never replaces one, and relinking changes the kind', () => {
    const id = exam();
    const t = addTaskWithCalendar({ title: 'Revise' });
    linkTaskToEvent(t, 'prepFor', 'event', id);
    expect(tasks()[t]).toMatchObject({ deadline: '2026-11-10', deadlineTime: '09:00' });
    const own = addTaskWithCalendar({ title: 'Book a room', deadline: '2026-11-01' });
    linkTaskToEvent(own, 'prepFor', 'event', id);
    expect(tasks()[own].deadline).toBe('2026-11-01');
    linkTaskToEvent(own, 'related', 'event', id);
    expect(tasksLinkedTo('event', id, tasks()).find((x) => x.task.id === own)!.kind).toBe('related');
    expect(tasks()[own].itemLinks).toHaveLength(1);
    unlinkTaskFromEvent(own, 'event', id);
    expect(tasks()[own].itemLinks).toEqual([]);
  });
});

describe('linked tasks follow their event', () => {
  it('moving the event moves preparation still due at its start and follow-ups still starting at its end; Undo puts them back', () => {
    const id = exam();
    const prep = addTaskWithCalendar({ title: 'Revise' });
    linkTaskToEvent(prep, 'prepFor', 'event', id);
    const follow = addTaskWithCalendar({ title: 'Check results' });
    linkTaskToEvent(follow, 'followUpOf', 'event', id);
    const own = addTaskWithCalendar({ title: 'Own date', deadline: '2026-11-05' });
    linkTaskToEvent(own, 'prepFor', 'event', id);

    useCalendarStore.getState().updateEvent(id as CalendarEventId, { date: '2026-11-17' });
    expect(tasks()[prep].deadline).toBe('2026-11-17');
    expect(tasks()[follow].scheduledAt).toBe('2026-11-17');
    expect(tasks()[own].deadline).toBe('2026-11-05');
    // The task's own calendar deadline moved with it.
    expect(useCalendarStore.getState().deadlines[tasks()[prep].calendarDeadlineId!].date).toBe('2026-11-17');
    const toast = useToastStore.getState().current!;
    expect(toast.message).toContain('2 linked tasks');
    toast.actions[0].onClick();
    expect(tasks()[prep].deadline).toBe('2026-11-10');
    expect(tasks()[follow].scheduledAt).toBe('2026-11-10');
  });

  it('a done task stays where it is, and a change sync brings from another device moves nothing', () => {
    const id = exam();
    const prep = addTaskWithCalendar({ title: 'Revise' });
    linkTaskToEvent(prep, 'prepFor', 'event', id);
    setHydrating(true);
    try {
      useCalendarStore.getState().updateEvent(id as CalendarEventId, { date: '2026-11-17' });
    } finally {
      setHydrating(false);
    }
    expect(tasks()[prep].deadline).toBe('2026-11-10');
    useTaskStore.getState().updateTask(prep, { completed: true });
    expect(followMove(tasks(), 'event', id, { start: '2026-11-10', startTime: '09:00', end: '2026-11-10' }, { start: '2026-11-20', startTime: '09:00', end: '2026-11-20' })).toEqual([]);
  });
});

describe('on the Runway, linked tasks sit under their event', () => {
  it('the task row names the event, and the bands put it under the event row (or as its own row when the event isn’t shown)', () => {
    const id = exam();
    const prep = addTaskWithCalendar({ title: 'Revise' });
    linkTaskToEvent(prep, 'prepFor', 'event', id);
    const snap = { tasks: tasks(), events: useCalendarStore.getState().events } as never;
    const taskRows = SOURCE_BY_KEY.task.rows(snap, TODAY).rows;
    const eventRows = SOURCE_BY_KEY.event.rows(snap, TODAY).rows;
    expect(taskRows[0].plan!.under).toBe(`event:${id}`);
    const bands = runwayBands([...taskRows, ...eventRows]);
    expect(bands.due.map((r) => r.title)).toEqual(['Exam']);
    expect(bands.children[`event:${id}`].map((r) => r.id)).toEqual([prep as TaskId]);
    expect(runwayBands(taskRows).due.map((r) => r.title)).toEqual(['Revise']);
  });
});
