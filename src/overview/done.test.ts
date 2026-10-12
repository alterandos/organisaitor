import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { canTickDone, tickOverviewRow } from './done';
import type { CalendarDeadlineId, CalendarReminderId, TaskId } from '@/types';
import type { OverviewRow } from '@/types/overview';

const row = (r: Partial<OverviewRow> & Pick<OverviewRow, 'source' | 'id'>): OverviewRow =>
  ({ key: `${r.source}:${r.id}`, title: 'x', when: '2026-10-20', time: null, status: 'open', endeavourId: null, context: null, ...r });

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
});

describe('ticking an Overview row done', () => {
  it('only tasks, reminders and deadlines can be ticked; not archived ones or undated reminders', () => {
    expect(canTickDone(row({ source: 'task', id: 't', when: null }))).toBe(true);
    expect(canTickDone(row({ source: 'deadline', id: 'd' }))).toBe(true);
    expect(canTickDone(row({ source: 'reminder', id: 'r', when: null }))).toBe(false);
    expect(canTickDone(row({ source: 'event', id: 'e' }))).toBe(false);
    expect(canTickDone(row({ source: 'note', id: 'n' }))).toBe(false);
    expect(canTickDone(row({ source: 'task', id: 't', status: 'archived' }))).toBe(false);
  });

  it('a task completes the usual way, and reopens', async () => {
    const id = useTaskStore.getState().addTask({ title: 'Buy milk' }) as TaskId;
    tickOverviewRow(row({ source: 'task', id }));
    await Promise.resolve();
    expect(useTaskStore.getState().tasks[id].completed).toBe(true);
    tickOverviewRow(row({ source: 'task', id, status: 'done' }));
    await Promise.resolve();
    expect(useTaskStore.getState().tasks[id].completed).toBe(false);
  });

  it('a reminder or deadline marks the row\'s date done, and not done again', () => {
    const r = useCalendarStore.getState().addReminder({ title: 'Call', date: '2026-10-20' }) as CalendarReminderId;
    tickOverviewRow(row({ source: 'reminder', id: r }));
    expect(useCalendarStore.getState().reminders[r].doneDates).toEqual(['2026-10-20']);
    tickOverviewRow(row({ source: 'reminder', id: r, status: 'done' }));
    expect(useCalendarStore.getState().reminders[r].doneDates).toEqual([]);

    const d = useCalendarStore.getState().addDeadline({ title: 'Essay', date: '2026-10-06', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null } }) as CalendarDeadlineId;
    tickOverviewRow(row({ source: 'deadline', id: d, when: '2026-10-13' }));
    expect(useCalendarStore.getState().deadlines[d].doneDates).toEqual(['2026-10-13']);
  });
});
