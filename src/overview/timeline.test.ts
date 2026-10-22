import { beforeEach, describe, expect, it } from 'vitest';
import { boardBuckets, bucketOf, runwayBands, runwayRange } from './timeline';
import { SOURCE_BY_KEY } from './sources';
import { moveRowDate, setRowStart } from './edit';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useToastStore } from '@/store/toastStore';
import { useTrashStore } from '@/store/trashStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import type { OverviewPlan, OverviewRow } from '@/types/overview';
import type { CalendarDeadlineId, TaskId } from '@/types';

const TODAY = '2026-10-22';   // a Thursday
const plan = (shape: OverviewPlan['shape'], p: Partial<OverviewPlan> = {}): OverviewPlan => ({ shape, start: null, endDate: null, endTime: null, important: false, movable: true, ...p });
const row = (key: string, when: string | null, p?: OverviewPlan, status: OverviewRow['status'] = 'open'): OverviewRow =>
  ({ key, source: 'task', id: key, title: key, when, time: null, status, endeavourId: null, context: null, plan: p });

describe('the Runway’s bands and span', () => {
  it('Important first, then by date soonest first, and the No date tray; rows with no plan are left off', () => {
    const rows = [row('b', '2026-11-03', plan('due')), row('a', '2026-10-25', plan('due')), row('imp', '2026-12-01', plan('due', { important: true })),
      row('idea', null, plan('tray')), row('note', null, undefined)];
    const bands = runwayBands(rows);
    expect(bands.important.map((r) => r.key)).toEqual(['imp']);
    expect(bands.due.map((r) => r.key)).toEqual(['a', 'b']);
    expect(bands.noDate.map((r) => r.key)).toEqual(['idea']);
  });

  it('spans from before the earliest thing (an overdue date, a start) to after the latest, within the zoom’s cap', () => {
    const { start, days } = runwayRange([row('late', '2026-10-15', plan('due')), row('far', '2026-12-30', plan('due'))], TODAY, 'month');
    expect(start).toBe('2026-10-13');
    expect(days).toBeGreaterThan(70);
    const capped = runwayRange([row('very far', '2028-01-01', plan('due'))], TODAY, 'week');
    expect(capped.days).toBeLessThanOrEqual(64);   // the week zoom's cap (60 days) and a little either side
  });
});

describe('the Board’s columns', () => {
  it('overdue, today, this week (to Sunday), next week, this month, later, no date; finished past things are left off', () => {
    expect(bucketOf(row('x', '2026-10-20', plan('due')), TODAY)).toBe('overdue');
    expect(bucketOf(row('x', '2026-10-20', plan('block'), 'past'), TODAY)).toBeNull();
    expect(bucketOf(row('x', TODAY, plan('point')), TODAY)).toBe('today');
    expect(bucketOf(row('x', '2026-10-25', plan('due')), TODAY)).toBe('week');
    expect(bucketOf(row('x', '2026-10-27', plan('due')), TODAY)).toBe('nextWeek');
    expect(bucketOf(row('x', '2026-10-31', plan('due')), TODAY)).toBe('nextWeek');
    expect(bucketOf(row('x', '2026-11-09', plan('due')), TODAY)).toBe('later');
    expect(bucketOf(row('x', null, plan('tray')), TODAY)).toBe('none');
  });

  it('important things come first in each column', () => {
    const b = boardBuckets([row('plain', '2026-10-24', plan('due')), row('imp', '2026-10-25', plan('due', { important: true }))], TODAY);
    expect(b.week.map((r) => r.key)).toEqual(['imp', 'plain']);
  });
});

describe('dragging on the Runway (overview/edit.ts)', () => {
  beforeEach(() => {
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    useCalendarStore.setState(useCalendarStore.getInitialState(), true);
    useToastStore.setState(useToastStore.getInitialState(), true);
    useTrashStore.setState(useTrashStore.getInitialState(), true);
  });
  const toastUndo = () => useToastStore.getState().current!.actions[0].onClick();
  const taskRow = (id: string) => SOURCE_BY_KEY.task.rows({ tasks: useTaskStore.getState().tasks } as never, TODAY).rows.find((r) => r.id === id)!;

  it('a task’s right end moves its deadline (and its calendar deadline), its left end its start; each undoable', () => {
    const id = addTaskWithCalendar({ title: 'Thesis', deadline: '2026-11-14' });
    expect(moveRowDate(taskRow(id), '2026-11-20')).toBe(true);
    const t = useTaskStore.getState().tasks[id as TaskId];
    expect(t.deadline).toBe('2026-11-20');
    expect(useCalendarStore.getState().deadlines[t.calendarDeadlineId!].date).toBe('2026-11-20');
    toastUndo();
    expect(useTaskStore.getState().tasks[id as TaskId].deadline).toBe('2026-11-14');
    expect(setRowStart(taskRow(id), '2026-11-01')).toBe(true);
    expect(useTaskStore.getState().tasks[id as TaskId].scheduledAt).toBe('2026-11-01');
    expect(taskRow(id).plan!.start).toBe('2026-11-01');
  });

  it('setting a start on a standalone Deadline makes it a task that keeps the Deadline; Undo puts it back, leaving nothing behind', () => {
    const dId = useCalendarStore.getState().addDeadline({ title: 'Tax return', date: '2026-11-03', important: true });
    const deadlineRow = SOURCE_BY_KEY.deadline.rows({ deadlines: useCalendarStore.getState().deadlines } as never, TODAY).rows[0];
    expect(setRowStart(deadlineRow, '2026-10-27')).toBe(true);
    const [task] = Object.values(useTaskStore.getState().tasks);
    expect(task).toMatchObject({ title: 'Tax return', deadline: '2026-11-03', scheduledAt: '2026-10-27', priority: 'high', calendarDeadlineId: dId });
    expect(useCalendarStore.getState().deadlines[dId as CalendarDeadlineId].deadlineType).toBe('task');
    expect(Object.keys(useCalendarStore.getState().deadlines)).toEqual([dId]);   // no second deadline
    toastUndo();
    expect(useTaskStore.getState().tasks).toEqual({});
    expect(useCalendarStore.getState().deadlines[dId as CalendarDeadlineId]).toMatchObject({ deadlineType: 'default', date: '2026-11-03' });
    expect(Object.keys(useCalendarStore.getState().events)).toEqual([]);         // the start's calendar entry went too
    expect(useTrashStore.getState().entries ?? {}).toEqual({});
  });
});
