import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrashStore } from '@/store/trashStore';
import { useToastStore } from '@/store/toastStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { toggleTaskWithLists } from '@/services/taskListLinks';
import { toggleTaskCompletion } from '@/services/taskCompletion';
import { nextOccurrenceDate, nextOccurrenceOf, repeatSummary } from '@/services/recurringTasks';
import { write as agentWrite } from '@/agent/access';
import type { RepeatConfig, TaskId } from '@/types';

const weekly: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };
const tasks = () => useTaskStore.getState().tasks;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 5, 9, 0));   // Mon 5 Oct 2026
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
  useToastStore.setState(useToastStore.getInitialState(), true);
});
afterEach(() => vi.useRealTimers());

describe('nextOccurrenceDate', () => {
  it('is the next date on the rule after this one', () => {
    expect(nextOccurrenceDate('2026-10-05', weekly, '2026-10-05')).toBe('2026-10-12');
    expect(nextOccurrenceDate('2026-01-31', { ...weekly, freq: 'monthly' }, '2026-01-31')).toBe('2026-03-03');
    expect(nextOccurrenceDate('2026-10-05', { ...weekly, interval: 2 }, '2026-10-05')).toBe('2026-10-19');
  });

  it('completing late skips the dates already past, rather than piling them up', () => {
    expect(nextOccurrenceDate('2026-10-05', weekly, '2026-10-20')).toBe('2026-10-26');
    expect(nextOccurrenceDate('2026-10-05', { ...weekly, freq: 'daily' }, '2026-10-20')).toBe('2026-10-20');
  });

  it('stops when the rule has ended', () => {
    expect(nextOccurrenceDate('2026-10-05', { ...weekly, endKind: 'until', until: '2026-10-10' }, '2026-10-05')).toBeNull();
    expect(nextOccurrenceDate('2026-10-05', { ...weekly, endKind: 'count', count: 1 }, '2026-10-05')).toBeNull();
    expect(nextOccurrenceDate('2026-10-05', { ...weekly, endKind: 'count', count: 2 }, '2026-10-05')).toBe('2026-10-12');
  });
});

describe('completing a recurring task', () => {
  function makeWeeklyReview(repeat: RepeatConfig = weekly): TaskId {
    const id = addTaskWithCalendar({
      title: 'Weekly review', notes: 'Inbox to zero', deadline: '2026-10-05', deadlineTime: '17:00', priority: 'high',
      crossAppRefs: [{ type: 'note', id: 'n1' }], repeat,
    });
    addTaskWithCalendar({ title: 'Inbox', parentId: id });
    const done = addTaskWithCalendar({ title: 'Calendar', parentId: id });
    useTaskStore.getState().toggleTask(done);
    return id;
  }

  it('creates the next occurrence: same details, next date, sub-tasks reset, linked back', () => {
    const id = makeWeeklyReview();
    const nextId = toggleTaskWithLists(id)!;
    const next = tasks()[nextId];
    expect(next).toMatchObject({
      title: 'Weekly review', notes: 'Inbox to zero', priority: 'high', deadline: '2026-10-12', deadlineTime: '17:00',
      completed: false, repeat: weekly, crossAppRefs: [{ type: 'note', id: 'n1' }],
    });
    expect(next.itemLinks).toMatchObject([{ kind: 'repeatOf', targetId: id }]);
    expect(next.subtaskIds.map((s) => [tasks()[s].title, tasks()[s].completed])).toEqual([['Inbox', false], ['Calendar', false]]);
    expect(next.calendarDeadlineId).not.toBeNull();     // its deadline is on the calendar like any task's
    expect(nextOccurrenceOf(id)?.id).toBe(nextId);
  });

  it('only one at a time: completing again doesn’t make a second', () => {
    const id = makeWeeklyReview();
    const first = toggleTaskWithLists(id);
    toggleTaskWithLists(id);            // reopen
    expect(toggleTaskWithLists(id)).toBe(first);
    expect(Object.values(tasks()).filter((t) => t.title === 'Weekly review')).toHaveLength(2);
  });

  it('"after N times" counts down, and the last one doesn’t repeat', () => {
    const id = makeWeeklyReview({ ...weekly, endKind: 'count', count: 2 });
    expect(repeatSummary(tasks()[id].repeat!)).toBe('Every week · 1 more');
    const second = toggleTaskWithLists(id)!;
    expect(tasks()[second].repeat).toMatchObject({ count: 1 });
    expect(toggleTaskWithLists(second)).toBeNull();
  });

  it('the Completed toast says when the next one is, and Undo takes it away again (nothing left in the bin)', async () => {
    const id = makeWeeklyReview();
    await toggleTaskCompletion(id);
    const toast = useToastStore.getState().current!;
    expect(toast.detail).toContain('Next one:');
    const before = Object.keys(tasks()).length;
    toast.actions.find((a) => a.label === 'Undo')!.onClick();
    expect(tasks()[id].completed).toBe(false);
    expect(nextOccurrenceOf(id)).toBeNull();
    expect(Object.keys(tasks()).length).toBe(before - 3);   // the occurrence and its two sub-tasks
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
  });

  it('an agent completing it gets the next occurrence too', () => {
    const id = makeWeeklyReview();
    agentWrite.toggleTask(id);
    expect(nextOccurrenceOf(id)?.deadline).toBe('2026-10-12');
  });
});
