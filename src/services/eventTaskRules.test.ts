// Tasks for each date of an event (services/eventTaskRules.ts over utils/eventTaskRules.ts): made for
// every date at once, to the series' end or 90 days ahead (a preparation is due when the class starts), linked to that date; a cancelled date takes its open task away; a moved
// date moves it; one the person deleted, or whose dates they changed, is left as they left it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrashStore } from '@/store/trashStore';
import { applyRuleTasks } from './eventTaskRules';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { ruleLinkOf } from '@/utils/eventTaskRules';
import { withException } from '@/utils/recurrence';
import type { CalendarEventId, CollectionId, EventTaskRule, RepeatConfig, Task } from '@/types';

const WEEKLY_WED: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [3] };
const PREPARE: EventTaskRule = { id: 'r1', title: 'Prepare', side: 'before', days: 1 };
const REVIEW: EventTaskRule = { id: 'r2', title: 'Review', side: 'after', days: 0 };
const TODAY = '2026-09-07';   // a Monday

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0));
  for (const s of [useTaskStore, useCalendarStore, useTrashStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});
afterEach(() => vi.useRealTimers());

const lecture = (rules: EventTaskRule[] = [PREPARE], collectionId: CollectionId | null = null) => {
  const id = useCalendarStore.getState().addEvent({ title: 'GEOS215 lecture', date: '2026-09-02', startTime: '10:00', endTime: '12:00', repeat: WEEKLY_WED, collectionId });
  useCalendarStore.getState().updateEvent(id, { taskRules: rules });
  return id;
};
const made = (): Task[] => Object.values(useTaskStore.getState().tasks).filter((t) => ruleLinkOf(t)).sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));

describe('tasks for each date of an event', () => {
  it('never makes a task already overdue: no date in the past, and none due earlier today (2026-11-05)', () => {
    // A rule "on the day, before it" on a Monday 10:00 class: today's task is due at 10:00.
    const id = useCalendarStore.getState().addEvent({ title: 'Seminar', date: '2026-08-31', startTime: '10:00', endTime: '11:00', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [1] } });
    useCalendarStore.getState().updateEvent(id, { taskRules: [{ id: 'r9', title: 'Bring notes', side: 'before', days: 0 }] });
    applyRuleTasks(TODAY, '15:00');
    expect(made().map((t) => t.deadline)).not.toContain(TODAY);
    expect(made().every((t) => (t.deadline ?? '') >= TODAY)).toBe(true);
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    useCalendarStore.getState().updateEvent(id, { taskRules: [{ id: 'r10', title: 'Bring notes', side: 'before', days: 0 }] });
    applyRuleTasks(TODAY, '08:00');
    expect(made().map((t) => t.deadline)).toContain(TODAY);
  });

  it('makes a task for every date at once (90 days ahead for a series that never ends), linked to that date, filed with the event', () => {
    const e = lecture([PREPARE], 'geos' as CollectionId);
    applyRuleTasks(TODAY);
    // Wed 9 Sep's is started Tue 8 Sep and due at the lecture; then one each Wednesday to 2 Dec (90 days).
    expect(made()[0]).toMatchObject({ title: 'Prepare: GEOS215 lecture', scheduledAt: '2026-09-08', deadline: '2026-09-09', deadlineTime: '10:00', collectionId: 'geos' });
    expect(made().map((t) => t.deadline)).toHaveLength(13);
    expect(made().at(-1)!.deadline).toBe('2026-12-02');
    expect(ruleLinkOf(made()[0])).toMatchObject({ kind: 'prepFor', targetId: e, occurrence: '2026-09-09', ruleId: 'r1' });
    applyRuleTasks(TODAY);
    expect(made()).toHaveLength(13);
    applyRuleTasks('2026-09-14');
    expect(made().map((t) => t.deadline)).toContain('2026-12-09');
  });

  it('a series with an end: every date to its end', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'Tutorial', date: '2026-09-02', startTime: '14:00', endTime: '15:00',
      repeat: { ...WEEKLY_WED, endKind: 'until', until: '2026-09-30' } });
    useCalendarStore.getState().updateEvent(id, { taskRules: [PREPARE] });
    applyRuleTasks(TODAY);
    expect(made().map((t) => t.deadline)).toEqual(['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30']);
  });

  it('after: from the class, due that day; on the day it is due at the class’s time when before', () => {
    lecture([REVIEW, { id: 'r3', title: 'Bring notes', side: 'before', days: 0 }]);
    applyRuleTasks(TODAY);
    const byTitle = Object.fromEntries(made().reverse().map((t) => [t.title.split(':')[0], t]));
    expect(byTitle.Review).toMatchObject({ scheduledAt: '2026-09-09', deadline: '2026-09-09' });
    expect(byTitle['Bring notes']).toMatchObject({ deadline: '2026-09-09', deadlineTime: '10:00' });
  });

  it('a cancelled date takes its open task away (to the Recycling Bin); a done one stays', () => {
    const e = lecture();
    applyRuleTasks(TODAY);
    const ev = useCalendarStore.getState().events[e];
    useCalendarStore.getState().updateEvent(e, { repeat: withException(ev.repeat!, '2026-09-09') });
    applyRuleTasks(TODAY);
    expect(made().map((t) => t.deadline)).not.toContain('2026-09-09');
    expect(Object.values(useTrashStore.getState().entries).map((x) => x.kind)).toContain('task');
    // Not made again for that date.
    useCalendarStore.getState().updateEvent(e, { repeat: WEEKLY_WED });
    applyRuleTasks('2026-09-14');
    expect(made().map((t) => t.deadline)).not.toContain('2026-09-09');
    const t = made().find((x) => x.deadline === '2026-09-16')!;
    useTaskStore.getState().updateTask(t.id, { completed: true, completedAt: new Date().toISOString() });
    useCalendarStore.getState().deleteEvent(e as CalendarEventId);
    applyRuleTasks('2026-09-14');
    expect(made().map((x) => x.id)).toEqual([t.id]);
  });

  it('one the person deleted is not made again', () => {
    lecture();
    applyRuleTasks(TODAY);
    deleteTaskWithCleanup(made()[0].id);
    applyRuleTasks(TODAY);
    expect(made().map((t) => t.deadline)).not.toContain('2026-09-09');
  });

  it('a date moved "only this one" moves its task; dates the person changed are left alone', () => {
    const e = lecture();
    applyRuleTasks(TODAY);
    const t = made()[0];
    // The 9 Sep lecture moves to Thursday the 10th.
    const ev = useCalendarStore.getState().events[e];
    useCalendarStore.getState().updateEvent(e, { repeat: withException(ev.repeat!, '2026-09-09') });
    useCalendarStore.getState().addEvent({ title: ev.title, date: '2026-09-10', startTime: '10:00', seriesId: e, seriesDate: '2026-09-09' });
    applyRuleTasks(TODAY);
    expect(useTaskStore.getState().tasks[t.id].deadline).toBe('2026-09-10');
    useTaskStore.getState().updateTask(t.id, { deadline: '2026-09-07' });
    applyRuleTasks(TODAY);
    expect(useTaskStore.getState().tasks[t.id].deadline).toBe('2026-09-07');
  });

  it('removing a rule takes its open tasks away', () => {
    const e = lecture();
    applyRuleTasks(TODAY);
    useCalendarStore.getState().updateEvent(e, { taskRules: [] });
    applyRuleTasks(TODAY);
    expect(made()).toHaveLength(0);
  });
});

describe('folding a rule’s tasks into one row', () => {
  it('the task due first stands for the others of its rule', async () => {
    const { foldRuleTasks } = await import('@/utils/eventTaskRules');
    lecture([PREPARE]);
    applyRuleTasks(TODAY);
    applyRuleTasks('2026-09-14');
    const plain = useTaskStore.getState().addTask({ title: 'Buy a calculator' });
    const all = [...made().reverse(), useTaskStore.getState().tasks[plain]];
    const { shown, folded } = foldRuleTasks(all);
    expect(shown.map((t) => t.title)).toEqual(['Prepare: GEOS215 lecture', 'Buy a calculator']);
    expect(shown[0].deadline).toBe('2026-09-09');
    expect(folded.get(shown[0].id)?.map((t) => t.deadline).sort()[0]).toBe('2026-09-16');
  });
});
